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

# Construir la aplicación Vite con las variables de entorno
RUN VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY npm run build


# Instalar `serve` para servir la aplicación en producción
RUN npm install -g serve

# Exponer el puerto 4173 para que EasyPanel lo use
EXPOSE 1975

# Servir la aplicación con `serve`
CMD ["sh", "-c", "exec serve -s dist -l 1975"]