FROM public.ecr.aws/docker/library/node:20-alpine AS build
WORKDIR /app
COPY apps/server/package.json ./package.json
COPY apps/server/tsconfig.json ./tsconfig.json
COPY tsconfig.base.json /tsconfig.base.json
COPY apps/server/src ./src
COPY apps/server/schemas ./schemas
RUN npm install
RUN npm run build

FROM public.ecr.aws/docker/library/node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/schemas ./schemas
COPY --from=build /app/package.json ./package.json
RUN npm install --omit=dev
ENV PORT=80
EXPOSE 80
CMD ["node", "dist/index.js"]
