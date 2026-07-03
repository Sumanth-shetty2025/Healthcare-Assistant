"""Flask inference API for serving TensorFlow .keras models."""
from __future__ import annotations

import base64
import io
import json
import os
from functools import lru_cache
from pathlib import Path
from typing import List, Sequence

import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image
import tensorflow as tf
import PyPDF2
import joblib

# Import RAG engine
try:
    from rag_engine import init_rag_engine, get_rag_engine
    RAG_AVAILABLE = True
except ImportError:
    RAG_AVAILABLE = False

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "model"
XRAY_MODEL_FILENAME = os.getenv("XRAY_MODEL_FILENAME", os.getenv("MODEL_FILENAME", "medical_model.keras"))
DEFAULT_IMAGE_SIZE = int(os.getenv("DEFAULT_IMAGE_SIZE", 224))
XRAY_CLASS_NAMES_PATH = os.getenv("XRAY_CLASS_NAMES_PATH", os.getenv("CLASS_NAMES_PATH", "labels.json"))
SCALE_INPUT = os.getenv("SCALE_INPUT", "true").lower() == "true"
PREPROCESS_MODE = os.getenv("PREPROCESS_MODE", "auto").lower()

app = Flask(__name__)
CORS(app)

# Initialize RAG engine on startup
rag_engine = None

@app.before_request
def setup_rag():
    global rag_engine
    if RAG_AVAILABLE and rag_engine is None:
        try:
            rag_engine = init_rag_engine()
        except Exception as e:
            print(f"Warning: RAG initialization failed: {e}")


def _load_class_names(label_path: str) -> List[str] | None:
    candidate_files: Sequence[Path] = (
        MODEL_DIR / label_path,
        MODEL_DIR / "labels.txt",
    )
    for file in candidate_files:
        if file.is_file():
            if file.suffix.lower() == ".json":
                with file.open("r", encoding="utf-8") as handle:
                    data = json.load(handle)
                    if isinstance(data, dict):
                        return [data[str(idx)] for idx in sorted(map(int, data.keys()))]
                    if isinstance(data, list):
                        return [str(item) for item in data]
            else:
                with file.open("r", encoding="utf-8") as handle:
                    return [line.strip() for line in handle if line.strip()]
    return None


@lru_cache(maxsize=2)
def load_model() -> tf.keras.Model:
    model_path = MODEL_DIR / XRAY_MODEL_FILENAME
    if not model_path.is_file():
        raise FileNotFoundError(
            f"Unable to locate model file at {model_path}. "
            "Place your .keras file in backend/model or update XRAY_MODEL_FILENAME."
        )
    return tf.keras.models.load_model(model_path)


@lru_cache(maxsize=2)
def load_class_names() -> List[str] | None:
    return _load_class_names(XRAY_CLASS_NAMES_PATH)


@lru_cache(maxsize=2)
def load_symptom_class_names() -> List[str] | None:
    try:
        model = load_symptom_model()
        classes = getattr(model, "classes_", None)
        if classes is None:
            return None
        return [str(item) for item in classes]
    except Exception:
        return None


def resolve_input_size(model: tf.keras.Model) -> tuple[int, int]:
    shape = model.input_shape
    if isinstance(shape, list):
        shape = shape[0]
    if len(shape) < 3:
        return (DEFAULT_IMAGE_SIZE, DEFAULT_IMAGE_SIZE)
    height, width = shape[1], shape[2]
    height = height or DEFAULT_IMAGE_SIZE
    width = width or DEFAULT_IMAGE_SIZE
    return int(height), int(width)


def _has_internal_rescaling(model: tf.keras.Model) -> bool:
    for layer in model.layers:
        if layer.__class__.__name__.lower() == "rescaling":
            return True
    return False


def preprocess_image(file_storage, target_size: tuple[int, int], model: tf.keras.Model) -> tuple[np.ndarray, np.ndarray]:
    image = Image.open(io.BytesIO(file_storage.read())).convert("RGB")
    image = image.resize(target_size, Image.Resampling.BILINEAR)
    array = np.asarray(image, dtype="float32")
    original = np.asarray(image, dtype="uint8")

    mode = PREPROCESS_MODE
    if mode == "auto":
        if _has_internal_rescaling(model):
            mode = "none"
        elif "efficientnet" in model.name.lower():
            mode = "efficientnet"
        else:
            mode = "rescale"

    if mode == "efficientnet":
        array = tf.keras.applications.efficientnet.preprocess_input(array)
    elif mode == "rescale":
        array /= 255.0

    array = np.expand_dims(array, axis=0)
    return array, original


def _sigmoid(value: float) -> float:
    return 1.0 / (1.0 + float(np.exp(-value)))


def _as_probabilities(vector: np.ndarray) -> np.ndarray:
    values = np.asarray(vector, dtype="float32").squeeze()

    # Binary model output (single neuron): convert to [P(class0), P(class1)].
    if values.ndim == 0:
        positive = float(values)
        if positive < 0.0 or positive > 1.0:
            positive = _sigmoid(positive)
        positive = float(np.clip(positive, 0.0, 1.0))
        return np.array([1.0 - positive, positive], dtype="float32")

    # Already probabilities.
    if np.all(values >= 0.0) and np.all(values <= 1.0):
        total = float(np.sum(values))
        if np.isfinite(total) and total > 0 and abs(total - 1.0) < 1e-3:
            return values.astype("float32")

    # Convert logits to probabilities via softmax.
    shifted = values - np.max(values)
    exp_values = np.exp(shifted)
    denominator = float(np.sum(exp_values))
    if denominator <= 0 or not np.isfinite(denominator):
        return values.astype("float32")
    return (exp_values / denominator).astype("float32")


def _resolve_label(class_index: int, class_names: List[str] | None) -> str:
    if class_names and 0 <= class_index < len(class_names):
        return class_names[class_index]
    return f"Class {class_index + 1}"


def format_prediction(raw_output: np.ndarray, class_names: List[str] | None) -> tuple[str, float, int]:
    vector = raw_output[0] if raw_output.ndim == 2 else raw_output
    probabilities = _as_probabilities(vector)
    predicted_index = int(np.argmax(probabilities))
    confidence = float(probabilities[predicted_index])
    label = _resolve_label(predicted_index, class_names)
    return label, confidence, predicted_index


def _flatten_layers(model: tf.keras.Model) -> list[tf.keras.layers.Layer]:
    flattened: list[tf.keras.layers.Layer] = []
    for layer in model.layers:
        flattened.append(layer)
        if isinstance(layer, tf.keras.Model):
            flattened.extend(_flatten_layers(layer))
    return flattened


def _find_last_conv_layer(model: tf.keras.Model) -> tf.keras.layers.Layer | None:
    for layer in reversed(_flatten_layers(model)):
        output_shape = getattr(layer, "output_shape", None)
        if output_shape is not None and len(output_shape) == 4:
            return layer
    return None


def _encode_image_data_url(image_array: np.ndarray) -> str:
    image = Image.fromarray(image_array.astype("uint8"))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _blend_heatmap(original_image: np.ndarray, heatmap: np.ndarray) -> str:
    values = np.nan_to_num(heatmap.astype("float32"), nan=0.0, posinf=0.0, neginf=0.0)
    values = np.maximum(values, 0.0)

    non_zero = values[values > 0.0]
    if non_zero.size > 16:
        low = float(np.percentile(non_zero, 45))
        high = float(np.percentile(non_zero, 99.5))
        if high > low:
            normalized = (values - low) / (high - low)
        else:
            max_value = float(np.max(values))
            normalized = values / max_value if max_value > 0 else values
    else:
        max_value = float(np.max(values))
        normalized = values / max_value if max_value > 0 else values

    normalized = np.clip(normalized, 0.0, 1.0)

    # Use stronger non-linear scaling so salient areas get much richer color.
    color_strength = np.power(normalized, 0.38)

    # Keep weak regions subtle and let strong regions dominate.
    alpha = 0.12 + 0.86 * np.power(normalized, 0.72)
    alpha = np.clip(alpha, 0.12, 0.98)

    # Jet-style color map: blue -> cyan -> yellow -> red.
    red = np.clip(1.5 - np.abs(4.0 * color_strength - 3.0), 0.0, 1.0)
    green = np.clip(1.5 - np.abs(4.0 * color_strength - 2.0), 0.0, 1.0)
    blue = np.clip(1.5 - np.abs(4.0 * color_strength - 1.0), 0.0, 1.0)
    overlay = np.stack([red, green, blue], axis=-1)

    # Keep very low activations lightly visible, not dominant.
    alpha = np.clip(alpha + 0.08 * (1.0 - normalized), 0.15, 0.98)

    base = original_image.astype("float32") / 255.0
    blended = base * (1.0 - alpha[..., np.newaxis]) + overlay * alpha[..., np.newaxis]

    # Two-level hotspot emphasis: warm halo + bright core.
    halo = np.clip((normalized - 0.45) / 0.55, 0.0, 1.0)
    core = np.clip((normalized - 0.70) / 0.30, 0.0, 1.0)
    blended[..., 0] = np.clip(blended[..., 0] + 0.22 * halo + 0.24 * core, 0.0, 1.0)
    blended[..., 1] = np.clip(blended[..., 1] + 0.10 * halo + 0.12 * core, 0.0, 1.0)

    # Slightly dim blue where the core is strongest, increasing red/yellow contrast.
    blended[..., 2] = np.clip(blended[..., 2] - 0.18 * core, 0.0, 1.0)
    blended = np.clip(blended, 0.0, 1.0)
    output_image = (blended * 255.0).astype("uint8")
    return _encode_image_data_url(output_image)


def build_gradcam(
    model: tf.keras.Model,
    model_input: np.ndarray,
    original_image: np.ndarray,
    predicted_index: int,
) -> str:
    last_conv_layer = _find_last_conv_layer(model)
    if last_conv_layer is None:
        return ""

    try:
        grad_model = tf.keras.models.Model(
            inputs=model.inputs,
            outputs=[last_conv_layer.output, model.output],
        )

        input_tensor = tf.convert_to_tensor(model_input)
        with tf.GradientTape() as tape:
            conv_output, model_output = grad_model(input_tensor, training=False)

            if isinstance(model_output, (list, tuple)):
                model_output = model_output[0]

            if len(model_output.shape) == 1:
                class_channel = model_output
            elif model_output.shape[-1] == 1:
                class_channel = model_output[:, 0]
            else:
                class_channel = model_output[:, predicted_index]

        gradients = tape.gradient(class_channel, conv_output)
        if gradients is None:
            return ""

        pooled_gradients = tf.reduce_mean(gradients, axis=(0, 1, 2))
        conv_output = conv_output[0]
        heatmap = tf.reduce_sum(conv_output * pooled_gradients, axis=-1)
        heatmap = tf.maximum(heatmap, 0)
        denominator = tf.reduce_max(heatmap)
        if float(denominator.numpy()) <= 0:
            return ""
        heatmap = heatmap / denominator

        height, width = original_image.shape[:2]
        resized_heatmap = tf.image.resize(
            heatmap[..., tf.newaxis],
            [height, width],
            method="bilinear",
        ).numpy()
        resized_heatmap = np.squeeze(resized_heatmap, axis=-1)
        return _blend_heatmap(original_image, resized_heatmap)
    except Exception:
        return ""


def build_input_gradient_map(
    model: tf.keras.Model,
    model_input: np.ndarray,
    original_image: np.ndarray,
    predicted_index: int,
) -> str:
    try:
        input_tensor = tf.convert_to_tensor(model_input)
        with tf.GradientTape() as tape:
            tape.watch(input_tensor)
            model_output = model(input_tensor, training=False)
            if isinstance(model_output, (list, tuple)):
                model_output = model_output[0]

            if len(model_output.shape) == 1:
                class_channel = model_output
            elif model_output.shape[-1] == 1:
                class_channel = model_output[:, 0]
            else:
                class_channel = model_output[:, predicted_index]

        gradients = tape.gradient(class_channel, input_tensor)
        if gradients is None:
            return ""

        grads = tf.abs(gradients[0])
        heatmap = tf.reduce_mean(grads, axis=-1)
        max_value = tf.reduce_max(heatmap)
        if float(max_value.numpy()) <= 0:
            return ""
        heatmap = heatmap / max_value

        height, width = original_image.shape[:2]
        resized_heatmap = tf.image.resize(
            heatmap[..., tf.newaxis],
            [height, width],
            method="bilinear",
        ).numpy()
        resized_heatmap = np.squeeze(resized_heatmap, axis=-1)
        return _blend_heatmap(original_image, resized_heatmap)
    except Exception:
        return ""


def build_explainability_map(
    model: tf.keras.Model,
    model_input: np.ndarray,
    original_image: np.ndarray,
    predicted_index: int,
) -> str:
    gradcam = build_gradcam(model, model_input, original_image, predicted_index)
    if gradcam:
        return gradcam
    return build_input_gradient_map(model, model_input, original_image, predicted_index)


def top_predictions(
    raw_output: np.ndarray,
    class_names: List[str] | None,
    count: int = 3,
) -> list[dict[str, float]]:
    vector = raw_output[0] if raw_output.ndim == 2 else raw_output
    probabilities = _as_probabilities(vector)
    top_count = min(count, probabilities.size)
    top_indexes = np.argsort(probabilities)[::-1][:top_count]
    return [
        {
            "label": _resolve_label(int(index), class_names),
            "confidence": float(probabilities[int(index)]),
        }
        for index in top_indexes
    ]


def _extract_text_from_file(file_storage) -> str:
    filename = getattr(file_storage, "filename", "").lower()
    if filename.endswith(".pdf"):
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(file_storage.read()))
            text_parts = []
            for page in reader.pages:
                try:
                    page_text = page.extract_text() or ""
                    text_parts.append(page_text)
                except Exception:
                    continue
            return "\n".join(text_parts).strip()
        except Exception:
            try:
                # fallback: read as bytes and decode
                data = file_storage.read()
                return data.decode("utf-8", errors="ignore")
            except Exception:
                return ""
    else:
        try:
            data = file_storage.read()
            return data.decode("utf-8", errors="ignore")
        except Exception:
            return ""


@app.post("/api/extract-symptom-text")
def extract_symptom_text():
    if "file" not in request.files:
        return jsonify({"error": "Missing form field 'file'."}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected."}), 400

    try:
        text = _extract_text_from_file(file)
        return jsonify({"success": True, "text": text, "filename": file.filename}), 200
    except Exception as exc:
        return jsonify({"error": f"Unable to extract text: {exc}"}), 500


@lru_cache(maxsize=2)
def load_symptom_model():
    model_path = MODEL_DIR / "best_model.pkl"
    if not model_path.is_file():
        raise FileNotFoundError(f"Unable to locate symptom model at {model_path}")
    try:
        return joblib.load(model_path)
    except Exception as e:
        # try pickle as fallback
        import pickle

        with open(model_path, "rb") as fh:
            return pickle.load(fh)


@lru_cache(maxsize=2)
def load_symptom_vectorizer():
    vectorizer_path = MODEL_DIR / "vectorizer.pkl"
    if not vectorizer_path.is_file():
        raise FileNotFoundError(f"Unable to locate symptom vectorizer at {vectorizer_path}")
    try:
        return joblib.load(vectorizer_path)
    except Exception:
        import pickle

        with open(vectorizer_path, "rb") as fh:
            return pickle.load(fh)


@lru_cache(maxsize=1)
def load_disease_database() -> dict:
    database_path = BASE_DIR / "knowledge_base" / "disease_database.json"
    if not database_path.is_file():
        return {}
    try:
        with database_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _tokenize_medical_text(text: str) -> set[str]:
    import re

    return set(re.findall(r"[a-z]+", text.lower()))


def _score_symptom_disease_match(symptoms_text: str) -> tuple[str, float]:
    normalized_text = symptoms_text.lower().strip()
    if not normalized_text:
        return "Unknown", 0.0

    disease_database = load_disease_database()
    if not disease_database:
        return "Unknown", 0.0

    token_set = _tokenize_medical_text(normalized_text)
    disease_scores: dict[str, float] = {}

    for disease_name, disease_info in disease_database.items():
        if not isinstance(disease_info, dict):
            continue

        score = 0.0
        symptom_text = str(disease_info.get("symptoms", "")).lower()
        characteristic_text = str(disease_info.get("characteristics", "")).lower()
        combined_text = f"{symptom_text} {characteristic_text}"

        if disease_name.lower() == "tuberculosis":
            keywords = {
                "cough": 1.5,
                "productive": 1.5,
                "blood": 2.5,
                "bloody": 2.5,
                "hemoptysis": 3.0,
                "night sweats": 3.0,
                "weight loss": 2.5,
                "fever": 1.5,
                "chest pain": 1.0,
                "fatigue": 1.0,
                "shortness of breath": 0.5,
                "dyspnea": 0.5,
                "cavitary": 2.0,
                "upper lobes": 2.0,
                "mucus": 1.0,
            }
        else:
            keywords = {
                "cough": 1.5,
                "productive": 2.0,
                "purulent": 3.0,
                "sputum": 2.5,
                "fever": 2.0,
                "dyspnea": 2.5,
                "shortness of breath": 2.5,
                "chills": 1.5,
                "pleuritic chest pain": 2.0,
                "respiratory distress": 2.0,
                "mucus": 1.0,
            }

        for phrase, weight in keywords.items():
            if phrase in normalized_text:
                score += weight

        overlap = token_set.intersection(_tokenize_medical_text(combined_text))
        score += float(len(overlap)) * 0.3
        disease_scores[disease_name] = score

    if not disease_scores:
        return "Unknown", 0.0

    best_disease = max(disease_scores, key=disease_scores.get)
    best_score = disease_scores[best_disease]
    second_best = sorted(disease_scores.values(), reverse=True)[1] if len(disease_scores) > 1 else 0.0

    if best_score <= 0:
        return "Unknown", 0.0

    confidence = float(np.clip(0.55 + (best_score - second_best) * 0.05, 0.0, 0.99))
    return str(best_disease).strip().lower(), confidence


def predict_symptom_disease(symptoms_text: str) -> tuple[str, float]:
    cleaned_text = (symptoms_text or "").strip()
    if not cleaned_text:
        return "Unknown", 0.0

    known_symptom_labels = {"pneumonia", "tuberculosis", "normal"}

    try:
        symptom_model = load_symptom_model()
        symptom_class_names = load_symptom_class_names()

        try:
            symptom_vectorizer = load_symptom_vectorizer()
            symptom_features = symptom_vectorizer.transform([cleaned_text])

            if hasattr(symptom_model, "predict_proba"):
                probs = symptom_model.predict_proba(symptom_features)
                probs = np.asarray(probs)
                if probs.ndim == 2:
                    idx = int(np.argmax(probs[0]))
                    confidence = float(probs[0][idx])
                else:
                    idx = int(np.argmax(probs))
                    confidence = float(probs[idx])

                if symptom_class_names and 0 <= idx < len(symptom_class_names):
                    label = str(symptom_class_names[idx]).strip().lower()
                else:
                    label = str(_resolve_label(idx, symptom_class_names)).strip().lower()

                if label in known_symptom_labels:
                    return label, confidence

            if hasattr(symptom_model, "predict"):
                pred = symptom_model.predict(symptom_features)
                if isinstance(pred, (list, tuple, np.ndarray)) and len(pred) > 0:
                    label = str(pred[0]).strip().lower()
                else:
                    label = str(pred).strip().lower()
                if label in known_symptom_labels:
                    return label, 0.75
        except Exception as exc:
            print(f"[DEBUG] Symptom vectorizer/model inference failed: {exc}")

    except Exception as exc:
        print(f"[DEBUG] Symptom model load failed: {exc}")

    return _score_symptom_disease_match(cleaned_text)


@app.post("/predict_hybrid")
def predict_hybrid():
    # Accepts: (image file) + (symptoms_text OR symptom_file)
    # At least ONE of image or symptoms is required
    
    # Extract or read symptom text
    symptoms_text = (request.form.get("symptoms_text") or "").strip()
    symptom_file = request.files.get("symptom_file")
    extracted_text = ""
    image_file = request.files.get("image")

    # DEBUG LOGGING
    print(f"[DEBUG] predict_hybrid() received:")
    print(f"  symptoms_text = {repr(symptoms_text)}")
    print(f"  symptoms_text length = {len(symptoms_text)}")
    print(f"  symptoms_text is_empty = {not symptoms_text}")
    print(f"  symptom_file = {symptom_file}")
    print(f"  image_file = {image_file}")

    # Try to extract text from symptom file if provided
    if symptom_file and getattr(symptom_file, "filename", ""):
        try:
            extracted_text = _extract_text_from_file(symptom_file)
            if not symptoms_text:
                symptoms_text = extracted_text
        except Exception:
            extracted_text = ""

    # Validate: at least one of image or symptoms is required
    has_image = image_file and getattr(image_file, "filename", "")
    has_symptoms = bool(symptoms_text)

    if not has_image and not has_symptoms:
        return jsonify({"error": "Either a chest X-ray image or symptom text is required."}), 400

    xray_label = "Unknown"
    xray_confidence = 0.0
    xray_top = []
    gradcam_data = ""
    xray_index = -1
    modality = "unknown"

    try:
        # X-ray inference (if image provided)
        if has_image:
            try:
                model = load_model()
                class_names = load_class_names()
                target_size = resolve_input_size(model)
                image_array, original_image = preprocess_image(image_file, target_size, model)
                raw_output = model.predict(image_array, verbose=0)
                xray_label, xray_confidence, xray_index = format_prediction(raw_output, class_names)
                xray_top = top_predictions(raw_output, class_names)
                gradcam_data = build_explainability_map(model, image_array, original_image, xray_index)
                print(f"[DEBUG] X-ray prediction: {xray_label} ({xray_confidence*100:.2f}%)")
            except Exception as e:
                print(f"[DEBUG] X-ray inference failed: {e}")
                xray_label = "Error"
                xray_confidence = 0.0

        # Symptom inference (if symptoms provided)
        symptom_label = "Unknown"
        symptom_confidence = 0.0

        print(f"[DEBUG] About to check if symptoms_text: {bool(symptoms_text)}")
        if has_symptoms:
            print(f"[DEBUG] Entering symptom inference block with text: {symptoms_text[:50]}...")
            symptom_label, symptom_confidence = predict_symptom_disease(symptoms_text)
            print(f"[DEBUG] Symptom prediction result: label={symptom_label}, confidence={symptom_confidence}")
        else:
            print(f"[DEBUG] Skipping symptom inference - symptoms_text is empty or None")

        # Determine final prediction based on what data is available
        final_label = "Unknown"
        final_confidence = 0.0
        note = ""
        modality = "unknown"

        # Case 1: Both image and symptoms available -> HYBRID
        if has_image and has_symptoms:
            modality = "hybrid"
            print(f"[DEBUG] MODALITY: Hybrid (both image and symptoms)")
            try:
                if symptom_label and symptom_label.lower() == xray_label.lower():
                    # Models agree -> higher confidence
                    final_confidence = float(np.clip(xray_confidence + 0.15 * symptom_confidence, 0.0, 1.0))
                    final_label = xray_label
                    note = "Both X-ray and symptom models agree on this diagnosis."
                else:
                    # Models disagree -> X-ray priority unless X-ray is Normal
                    if xray_label.lower() == "normal" and symptom_label.lower() != "normal" and symptom_label.lower() != "unknown":
                        final_label = symptom_label
                        final_confidence = float(np.clip(0.9 * symptom_confidence, 0.0, 1.0))
                        note = "Possible early-stage disease detected based on symptoms despite normal X-ray."
                    else:
                        final_label = xray_label
                        final_confidence = xray_confidence
                        note = "X-ray model confidence prioritized. Consult clinical judgment."
            except Exception:
                final_label = xray_label
                final_confidence = xray_confidence
        # Case 2: Only image -> IMAGE-ONLY
        elif has_image:
            modality = "xray"
            final_label = xray_label
            final_confidence = xray_confidence
            note = "Prediction based on X-ray image analysis only."
            print(f"[DEBUG] MODALITY: X-ray only")
        # Case 3: Only symptoms -> SYMPTOM-ONLY
        elif has_symptoms:
            modality = "symptom"
            final_label = symptom_label
            final_confidence = symptom_confidence
            note = "Prediction based on symptom analysis only. Consider X-ray imaging for confirmation."
            print(f"[DEBUG] MODALITY: Symptom only")

        # Build a simple generated medical report
        report_lines = [
            f"Analysis type: {modality.upper()}",
            f"Final prediction: {final_label} (confidence={round(final_confidence*100,2)}%)",
        ]
        if has_image:
            report_lines.append(f"X-ray model: {xray_label} (confidence={round(xray_confidence*100,2)}%)")
        if has_symptoms:
            report_lines.append(f"Symptom model: {symptom_label} (confidence={round(symptom_confidence*100,2)}%)")
        if note:
            report_lines.append(note)

        report_text = "\n".join(report_lines)

        return jsonify(
            {
                "modality": modality,
                "final_prediction": final_label,
                "final_confidence": final_confidence,
                "note": note,
                "xray": {
                    "prediction": xray_label if has_image else None,
                    "confidence": xray_confidence if has_image else None,
                    "top_predictions": xray_top if has_image else [],
                    "gradcam": gradcam_data if has_image else "",
                },
                "symptoms": {
                    "text": symptoms_text if has_symptoms else None,
                    "extracted_text": extracted_text if has_symptoms else "",
                    "prediction": symptom_label if has_symptoms else None,
                    "confidence": symptom_confidence if has_symptoms else None,
                },
                "generated_report": report_text,
            }
        )

    except FileNotFoundError as missing_model:
        return jsonify({"error": str(missing_model)}), 500
    except Exception as exc:
        return jsonify({"error": f"Prediction failed: {exc}"}), 500


@app.get("/health")
def health_check():
    xray_path = str(MODEL_DIR / XRAY_MODEL_FILENAME)
    return jsonify(
        {
            "status": "ok",
            "models": {
                "xray": {"path": xray_path, "available": Path(xray_path).is_file()},
            },
        }
    )


@app.post("/predict")
def predict():
    if "image" not in request.files:
        return jsonify({"error": "Missing form field 'image'."}), 400

    file = request.files["image"]
    if not file.filename:
        return jsonify({"error": "No file selected."}), 400

    try:
        model = load_model()
        class_names = load_class_names()
        target_size = resolve_input_size(model)
        image_array, original_image = preprocess_image(file, target_size, model)
        raw_output = model.predict(image_array, verbose=0)
        label, confidence, predicted_index = format_prediction(raw_output, class_names)
        ranked = top_predictions(raw_output, class_names)
        gradcam_data = build_explainability_map(model, image_array, original_image, predicted_index)
    except FileNotFoundError as missing_model:
        return jsonify({"error": str(missing_model)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Inference failed: {exc}"}), 500

    return jsonify(
        {
            "modality": "xray",
            "prediction": label,
            "confidence": confidence,
            "confidence_percent": round(confidence * 100.0, 2),
            "top_predictions": ranked,
            "gradcam": gradcam_data,
        }
    )


# RAG endpoints for disease information retrieval
@app.route("/api/disease-info", methods=["POST"])
def get_disease_info():
    """
    Retrieve disease information using RAG engine.
    
    Request body:
    {
        "disease": "tuberculosis",
        "modality": "xray"  (optional)
    }
    
    Response:
    {
        "success": true,
        "disease": "tuberculosis",
        "modality": "xray",
        "information": {
            "characteristics": "...",
            "symptoms": "...",
            "treatment": "...",
            "prevention": "...",
            "advice": "..."
        }
    }
    """
    try:
        if not RAG_AVAILABLE:
            return jsonify({
                "error": "RAG engine not available. Install chromadb and langchain packages."
            }), 503
        
        data = request.json
        if not data:
            return jsonify({"error": "Request body required"}), 400
        
        disease_name = data.get("disease", "").strip()
        modality = "xray"
        
        if not disease_name:
            return jsonify({"error": "Disease name required in request body"}), 400
        
        # Retrieve disease information from RAG engine
        rag_engine = get_rag_engine()
        disease_info = rag_engine.retrieve_disease_info(disease_name)
        
        return jsonify({
            "success": True,
            "disease": disease_name,
            "modality": modality,
            "information": disease_info
        }), 200
        
    except Exception as e:
        print(f"Error in /api/disease-info: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/diseases", methods=["GET"])
def list_diseases():
    """
    Get list of all available diseases in knowledge base.
    
    Response:
    {
        "diseases": ["tuberculosis", "pneumonia", "normal", ...]
    }
    """
    try:
        if not RAG_AVAILABLE:
            return jsonify({"diseases": []}), 200
        
        rag_engine = get_rag_engine()
        diseases = rag_engine.get_all_diseases()
        
        return jsonify({"diseases": diseases}), 200
        
    except Exception as e:
        print(f"Error in /api/diseases: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/disease-section-detail", methods=["POST"])
def get_disease_section_detail():
    """Generate detailed section content for the scanning report cards.

    Request body:
    {
        "disease": "tuberculosis",
        "section": "Symptoms",
        "modality": "xray"  (optional)
    }
    """
    try:
        if not RAG_AVAILABLE:
            return jsonify({
                "error": "RAG engine not available. Install chromadb and langchain packages."
            }), 503

        data = request.json or {}
        disease_name = str(data.get("disease", "")).strip()
        section = str(data.get("section", "")).strip()
        modality = str(data.get("modality", "xray")).strip().lower()

        if not disease_name:
            return jsonify({"error": "Disease name required in request body"}), 400
        if not section:
            return jsonify({"error": "Section name required in request body"}), 400

        if modality not in SUPPORTED_MODALITIES:
            modality = "xray"

        rag_engine = get_rag_engine()
        detail_payload = rag_engine.generate_detailed_section_explanation(
            disease_name=disease_name,
            section=section,
            modality=modality,
        )

        return jsonify({
            "success": True,
            "disease": disease_name,
            "modality": modality,
            "section": section,
            "detail": detail_payload,
        }), 200

    except Exception as e:
        print(f"Error in /api/disease-section-detail: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG") == "1")
