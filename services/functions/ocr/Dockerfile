# ============================================================================
# Collision Engineers — OCR host container image ([BUILD] artifact).
#
# Azure Functions (Python v2) running on Azure Container Apps (scale-to-zero).
# This image exists for ONE reason: to carry the `tesseract` OS binary that
# Flex Consumption (FC1) structurally cannot provide, lighting up the parser
# engine's already-written OCR fallback with zero engine-code change, and to
# co-host the fast-alpr registration-plate OCR (see docs/architecture/integrations.md).
#
# Base image: the official Azure Functions Python 4.x image (Python 3.12). KEEP
# THIS PINNED + UPDATE MONTHLY — Microsoft publishes monthly base-image security
# updates and requires custom containers to track them
# (learn.microsoft.com/azure/azure-functions/container-concepts).
#
# Build/push is [DEPLOY-WITH-LOGIN] (az acr build / docker build + push). No
# secret is baked: the DI Read key (only needed for OCR_PROVIDER=docintel) is a
# Key Vault reference app setting resolved by the container's managed identity.
# ============================================================================
FROM mcr.microsoft.com/azure-functions/python:4-python3.12

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true \
    # Default doc-OCR engine. Override to "docintel" (app setting) to use the
    # managed Document Intelligence Read fallback instead of in-container Tesseract.
    OCR_PROVIDER=tesseract \
    # Default plate engine. Override to "docintel" to use DI Read over the photo.
    PLATE_PROVIDER=fast_alpr

# --- The one binary FC1 cannot give us: Tesseract (+ English language data) ---
# Also install libGL/glib which onnxruntime + opencv (pulled by fast-alpr) need
# for image decoding at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-eng \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# --- Python deps (CPU-only wheels) -------------------------------------------
COPY requirements.txt /
RUN pip install --no-cache-dir -r /requirements.txt

# --- (Optional) bake fast-alpr ONNX models into the image to avoid a first-call
# download on cold start. Uncomment + provide the models under ./models/ to bake;
# otherwise fast-alpr downloads them lazily on first /plate-ocr call.
# COPY models/ /home/site/wwwroot/models/
# ENV ALPR_MODELS_DIR=/home/site/wwwroot/models

# --- App code ----------------------------------------------------------------
# function_app.py, ocr_pdf_adapter.py, plate_adapter.py, host.json. The optional
# vendored engine (cedocumentmapper_v2/) is copied too WHEN present, enabling the
# full 12-field extraction path; absent, /ocr-pdf returns raw OCR text only.
COPY . /home/site/wwwroot

# Container Apps routes ingress to port 80 by default; the Functions base image
# listens on 80. (If changed, set the WEBSITES_PORT app setting to match.)
EXPOSE 80
