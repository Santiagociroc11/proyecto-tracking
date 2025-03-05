# Usa una imagen oficial de Node.js
FROM node:18

# Define el directorio de trabajo en el contenedor
WORKDIR /app

# Copia package.json y package-lock.json e instala TODAS las dependencias
COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile

# Copia el resto del código fuente
COPY . .

# Define las variables de entorno para el build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Define el puerto para el servidor Express
ENV PORT=1975

# Construye el frontend y el backend
RUN npm run build

# Exponer el puerto 1975
EXPOSE 1975

# Arranca el servidor Express compilado
CMD ["node", "dist/server.js"]
