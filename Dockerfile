# Usa una imagen oficial de Node.js
FROM node:18

# Define el directorio de trabajo en el contenedor
WORKDIR /app

# Copia package.json y package-lock.json e instala TODAS las dependencias
COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile

# Copia el resto del código fuente
COPY . .

# Definir las variables de entorno en el build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Construir la aplicación (compila tanto frontend como backend)
RUN npm run build

# Exponer el puerto en el que corre tu servidor Express
EXPOSE 3000

# Arranca el servidor Express (ajusta la ruta según tu compilación)
CMD ["node", "dist/server.js"]
