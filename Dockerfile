# Use a lightweight web server to serve the static files
FROM nginx:1.25-alpine

# Remove the default Nginx configuration file
RUN rm /etc/nginx/conf.d/default.conf

# Create a custom Nginx configuration
COPY <<EOF /etc/nginx/conf.d/omnitrivia.conf
server {
    listen 8080;
    server_name localhost;

    # Root directory for the static files
    root /usr/share/nginx/html;
    index index.html;

    location / {
        # Try to serve the requested file, otherwise fall back to index.html
        # This is crucial for single-page applications (SPAs) to handle routing
        try_files \$uri \$uri/ /index.html;
    }

    # Optional: Add headers to prevent caching during development/testing
    # In production, you might want to configure caching properly
    add_header 'Cache-Control' 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';
    expires off;
    etag off;
}
EOF

# Copy all the application files to the Nginx public directory
COPY . /usr/share/nginx/html

# Expose port 8080
EXPOSE 8080

# Start Nginx when the container launches
CMD ["nginx", "-g", "daemon off;"]
