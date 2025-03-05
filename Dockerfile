FROM node:18

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# Define el puerto esperado por EasyPanel
ENV PORT=1975
EXPOSE 1975

# Arranca el servidor Express compilado
CMD ["node", "dist/server.js"]
