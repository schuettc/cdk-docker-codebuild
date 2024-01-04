FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:alpine3.18
RUN apk update && apk add curl

ARG FUNCTION_DIR="/function"
RUN mkdir -p ${FUNCTION_DIR}
COPY src/* ${FUNCTION_DIR}/
WORKDIR ${FUNCTION_DIR}
RUN yarn install --frozen-lockfile
RUN yarn tsc

EXPOSE 8080

CMD ["node", "dist/index.js"]