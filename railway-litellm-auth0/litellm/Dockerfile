FROM ghcr.io/berriai/litellm:v1.106.6
COPY render_config.py /app/render_lab_config.py
COPY start.sh /app/start_lab.sh
ENTRYPOINT ["/bin/sh", "/app/start_lab.sh"]
