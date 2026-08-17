FROM ghcr.io/valhalla/valhalla:latest

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]
