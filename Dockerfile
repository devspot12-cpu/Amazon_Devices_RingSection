# Minimal container for Amazon_Devices_RingSection.
#
# The repo has no application code yet, so this runs a small placeholder
# service. It exists so the release pipeline is real and verifiable end to end:
# a merge to main produces a runnable image on Docker Hub.
#
# Replace app.py (and the EXPOSE port if needed) when the actual Ring service
# lands. The build/push wiring in .github/workflows/release.yml needs no change.

FROM python:3.12-slim

# Fail fast, no .pyc files, unbuffered logs (so CI and docker logs show output live).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Copy requirements first so dependency layers cache across code changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

# Run as a non-root user. Creating it after the install keeps the image smaller
# and avoids the container running as root.
RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8080

# The service answers GET /health with 200, so the container reports healthy.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=2).status==200 else 1)"

CMD ["python", "app.py"]
