#!/usr/bin/env python3
"""
Test script to verify RAG engine setup and functionality.
Run this to check if everything is configured correctly.
"""

import json
import sys
from pathlib import Path

def check_knowledge_base():
    """Verify knowledge base file exists and is valid JSON."""
    print("\n📋 Checking Knowledge Base...")
    kb_path = Path("knowledge_base/disease_database.json")
    
    if not kb_path.exists():
        print(f"  ✗ Knowledge base not found at {kb_path}")
        return False
    
    try:
        with open(kb_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        print(f"  ✓ Knowledge base loaded successfully")
        print(f"  ✓ Contains {len(data)} diseases:")
        for disease in sorted(data.keys()):
            print(f"    - {disease}")
        return True
    except Exception as e:
        print(f"  ✗ Error loading knowledge base: {e}")
        return False


def check_rag_engine():
    """Test RAG engine initialization without requiring RAG dependencies."""
    print("\n🤖 Checking RAG Engine...")
    
    try:
        # Try to import RAG engine (will work even without RAG deps for static mode)
        from rag_engine import DiseaseRAGEngine
        print("  ✓ RAG engine module found")
        
        # Initialize engine (will use static mode if RAG deps missing)
        engine = DiseaseRAGEngine()
        print(f"  ✓ RAG engine initialized")
        print(f"  ✓ Loaded {engine.get_disease_count()} diseases")
        
        # Test retrieval
        test_disease = "tuberculosis"
        info = engine.retrieve_disease_info(test_disease)
        if info:
            print(f"  ✓ Successfully retrieved info for '{test_disease}'")
            return True
        else:
            print(f"  ✗ Failed to retrieve info for '{test_disease}'")
            return False
            
    except Exception as e:
        print(f"  ✗ Error initializing RAG engine: {e}")
        return False


def check_flask_app():
    """Check if Flask app can start with RAG endpoints."""
    print("\n🔧 Checking Flask App...")
    
    try:
        from app import app
        print("  ✓ Flask app imports successfully")
        
        # Check if RAG endpoints are registered
        routes = [rule.rule for rule in app.url_map.iter_rules()]
        
        if "/api/disease-info" in routes:
            print("  ✓ /api/disease-info endpoint registered")
        else:
            print("  ✗ /api/disease-info endpoint NOT registered")
            return False
        
        if "/api/diseases" in routes:
            print("  ✓ /api/diseases endpoint registered")
        else:
            print("  ✗ /api/diseases endpoint NOT registered")
            return False
        
        return True
        
    except Exception as e:
        print(f"  ✗ Error checking Flask app: {e}")
        return False


def check_dependencies():
    """Check which optional dependencies are installed."""
    print("\n📦 Checking Dependencies...")
    
    dependencies = {
        "chromadb": "Vector database (required for advanced RAG)",
        "langchain": "LangChain framework (required for advanced RAG)",
        "langchain_huggingface": "HuggingFace integration (required for embeddings)",
        "sentence_transformers": "Embedding models (required for vector search)"
    }
    
    all_installed = True
    
    for package, description in dependencies.items():
        try:
            __import__(package)
            print(f"  ✓ {package:<30} - {description}")
        except ImportError:
            print(f"  ✗ {package:<30} - NOT INSTALLED")
            all_installed = False
    
    if not all_installed:
        print("\n  💡 Optional: Install advanced RAG features:")
        print("     pip install chromadb langchain langchain-community langchain-huggingface sentence-transformers")
    
    return all_installed


def check_frontend_service():
    """Check if frontend service file exists."""
    print("\n🎨 Checking Frontend Service...")
    
    service_path = Path("../src/utils/diseaseInfoService.js")
    
    if service_path.exists():
        print(f"  ✓ Disease info service found at {service_path}")
        return True
    else:
        print(f"  ✗ Disease info service NOT found at {service_path}")
        return False


def main():
    """Run all checks."""
    print("=" * 60)
    print("🏥 RAG System Health Check")
    print("=" * 60)
    
    # Change to backend directory
    import os
    if not Path("rag_engine.py").exists():
        print("❌ Please run this script from the backend directory")
        print("   cd backend && python test_rag.py")
        sys.exit(1)
    
    checks = [
        ("Knowledge Base", check_knowledge_base),
        ("RAG Engine", check_rag_engine),
        ("Flask App", check_flask_app),
        ("Dependencies", check_dependencies),
        ("Frontend Service", check_frontend_service),
    ]
    
    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"  ✗ Unexpected error: {e}")
            results.append((name, False))
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Summary")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status:<9} {name}")
    
    print("\n" + "=" * 60)
    if passed == total:
        print(f"✅ All checks passed! ({passed}/{total})")
        print("\nYour RAG system is ready:")
        print("1. python app.py          # Start Flask backend")
        print("2. npm start              # Start React frontend")
        print("3. Upload an image and view the Scanning Report")
        sys.exit(0)
    else:
        print(f"⚠️  Some checks failed ({passed}/{total})")
        print("\nFix the issues above and run again:")
        print("python test_rag.py")
        sys.exit(1)


if __name__ == "__main__":
    main()
