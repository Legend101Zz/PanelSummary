# ============================================================
# DOCKERFILE — recipe for building the Python backend container
# Think of this as "instructions for setting up a fresh computer"
# ============================================================

# Start with Python 3.12 on slim Debian (smaller image)
FROM python:3.12-slim

# Set working directory inside the container
WORKDIR /app

# Install system dependencies that some Python packages need
# (like a compiler for packages that include C code)
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    poppler-utils \
    tesseract-ocr \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (Docker caches this layer)
# WHY: If we copy all code first, Docker rebuilds everything when ANY file changes
# By copying requirements first, Docker only reinstalls packages when requirements.txt changes
COPY requirements.txt .

# Install Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code
COPY . .

# Expose port 8000 (FastAPI runs here)
EXPOSE 8000

# Command to start FastAPI
# --host 0.0.0.0 means "accept connections from outside the container"
# --reload means "restart when code changes" (great for development)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
