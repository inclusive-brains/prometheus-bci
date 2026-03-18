# ── Stage 1: Build dependencies ─────────────────────────────────────────────
FROM python:3.10-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        libhdf5-dev \
        libzmq3-dev \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM python:3.10-slim

LABEL maintainer="Prometheus BCI"
LABEL description="Prometheus BCI — Brain-Computer Interface platform"

# Runtime system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        libhdf5-103 \
        libzmq5 \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libfontconfig1 \
        libportaudio2 \
        # ── Hardware support (Bluetooth/USB EEG, BITalino) ──
        bluez \
        libbluetooth3 \
        libusb-1.0-0 \
        usbutils \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

WORKDIR /app

# Copy project files
COPY nodes/ nodes/
COPY estimators/ estimators/
COPY graphs/ graphs/
COPY ui/ ui/
COPY scripts/ scripts/
COPY app.yaml .
COPY .env .

# Create data & logs directories
RUN mkdir -p data logs models

# Expose ports: 8002 = Timeflux UI, 8888 = Setup UI
EXPOSE 8002 8888

# Volumes for persistent data
VOLUME ["/app/data", "/app/logs", "/app/models"]

# Healthcheck on the Timeflux UI port
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8002/')" || exit 1

# Default: launch Timeflux
CMD ["timeflux", "-d", "app.yaml"]
