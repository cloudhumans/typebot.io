# Dockerfile para um cliente minimalista de PostgreSQL
FROM alpine:latest

# Instalar o cliente PostgreSQL
RUN apk add --no-cache postgresql-client

# Comando padrão
CMD ["psql"]
