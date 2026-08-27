FROM nginx:1.25-alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/omnitrivia.conf /etc/nginx/conf.d/omnitrivia.conf

COPY . /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
