const buildCloudinaryUploadUrl = (cloudName) => {
  if (!cloudName) {
    throw new Error('Missing Cloudinary cloud name.');
  }
  return `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
};

export async function uploadUnsignedToCloudinary({
  file,
  cloudName,
  uploadPreset,
  folder,
  publicId,
  tags,
  context,
  onProgress,
} = {}) {
  if (!file) {
    throw new Error('No file provided for upload.');
  }
  if (!uploadPreset) {
    throw new Error('Missing Cloudinary upload preset.');
  }

  const url = buildCloudinaryUploadUrl(cloudName);

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'json';

    xhr.upload.onprogress = (evt) => {
      if (!onProgress) return;
      if (!evt.lengthComputable) {
        onProgress({ loaded: evt.loaded, total: null, percent: null });
        return;
      }
      const percent = evt.total ? Math.round((evt.loaded / evt.total) * 100) : null;
      onProgress({ loaded: evt.loaded, total: evt.total, percent });
    };

    xhr.onload = () => {
      const body = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300 && body && body.secure_url) {
        resolve(body);
        return;
      }

      const message =
        body?.error?.message ||
        (typeof body === 'string' ? body : null) ||
        `Cloudinary upload failed (${xhr.status}).`;
      reject(new Error(message));
    };

    xhr.onerror = () => {
      reject(new Error('Cloudinary upload failed (network/CORS error).'));
    };

    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', uploadPreset);
    if (folder) form.append('folder', folder);
    if (publicId) form.append('public_id', publicId);
    if (tags) form.append('tags', tags);
    if (context) form.append('context', context);

    xhr.send(form);
  });
}
