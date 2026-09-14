FROM golang:1.26-alpine3.23 AS builder
RUN apk add --no-cache gcc musl-dev zlib-dev pkgconfig
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -o /hello_world ./hello_world/main.go

FROM alpine:3.23

WORKDIR /app

COPY --from=builder /hello_world /app/hello_world

ENTRYPOINT ["/app/hello_world"]