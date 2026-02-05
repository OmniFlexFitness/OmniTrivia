# OmniTrivia Deployment Guide

This guide provides step-by-step instructions to deploy the OmniTrivia application to Google Cloud Run, making it accessible via a public URL.

## Prerequisites

1.  **Google Cloud Project:** You need a Google Cloud project with billing enabled.
2.  **`gcloud` CLI:** Install and initialize the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install).
3.  **Docker:** Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) on your local machine.
4.  **Enabled APIs:** Ensure the following APIs are enabled in your Google Cloud project. You can enable them with the `gcloud` command below or via the Cloud Console.
    *   Cloud Build API (`cloudbuild.googleapis.com`)
    *   Artifact Registry API (`artifactregistry.googleapis.com`)
    *   Cloud Run API (`run.googleapis.com`)

## A Note on Security (CMEK)

While using Vertex AI Studio, you may see a "Save prompt" dialog with an option for "Customer-managed encryption key (CMEK)".

*   **This setting is for saving your development prompts within Vertex AI Studio and does NOT affect your application's deployment or runtime security.**
*   CMEK is an advanced security feature for meeting strict compliance requirements.
*   **For this project, you do not need CMEK.** Google's default encryption is sufficient. Leave the CMEK box unchecked to avoid unnecessary complexity.

The deployment steps below are the correct procedure for getting your application live.

## Deployment Steps

### Step 1: Configure Your Environment

Open your terminal and set your project ID and a preferred region.

```bash
# Replace [YOUR_PROJECT_ID] with your actual Google Cloud project ID
export PROJECT_ID="[YOUR_PROJECT_ID]"

# Set a region for your resources
export REGION="us-central1"

gcloud config set project $PROJECT_ID
gcloud config set compute/region $REGION
```

### Step 2: Enable Required Services

Run this command to ensure all necessary APIs are enabled for your project.

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

### Step 3: Create a Docker Repository

We need a place to store our container image. We'll use Artifact Registry.

```bash
gcloud artifacts repositories create omnitrivia-repo \
  --repository-format=docker \
  --location=$REGION \
  --description="Docker repository for OmniTrivia app"
```

### Step 4: Build and Push the Container Image

This command uses Cloud Build to build your Docker image and push it to the Artifact Registry repository you just created. It reads the `Dockerfile` in your project directory.

Make sure you are in the root directory of the application (where the `Dockerfile` is located).

```bash
gcloud builds submit --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/omnitrivia-repo/omnitrivia-app:latest
```

This process might take a few minutes. Cloud Build will package your application files into a container image and store it securely.

### Step 5: Deploy to Cloud Run

Now, deploy the container image to Cloud Run. This will create a managed, serverless service that runs your application.

```bash
gcloud run deploy omnitrivia-app \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/omnitrivia-repo/omnitrivia-app:latest" \
  --platform=managed \
  --region=$REGION \
  --allow-unauthenticated \
  --port=8080
```

*   `--allow-unauthenticated`: This makes your service publicly accessible.
*   `--port=8080`: This tells Cloud Run that your container is listening on port 8080 (as configured in the `Dockerfile`).

After the deployment is complete, the command will output a **Service URL**. This is the public URL for your trivia game!

### Step 6: (Optional) Set Up a Custom Domain

To use `trivia.omniflexfitness.com`, you need to map it to your Cloud Run service.

1.  **Navigate to Cloud Run:** In the Google Cloud Console, go to the Cloud Run section and select your `omnitrivia-app` service.
2.  **Manage Custom Domains:** Click on "Manage custom domains" and then "ADD MAPPING".
3.  **Select Domain:** Choose the option to map a new domain. You will be prompted to verify that you own `omniflexfitness.com` (usually by adding a TXT record to your DNS). Follow the instructions provided.
4.  **Enter Subdomain:** Enter `trivia` as the subdomain.
5.  **Update DNS Records:** Google will provide you with A and AAAA records. Go to your domain registrar (where you bought `omniflexfitness.com`) and update the DNS settings for the `trivia` subdomain to point to the IP addresses provided by Google.
6.  **Wait for Propagation:** It may take some time (from a few minutes to several hours) for the DNS changes to propagate and for the SSL certificate to be provisioned.

## Connecting from a Phone

Once your app is deployed and accessible at `https://trivia.omniflexfitness.com`:

1.  **Host a Game:** Use a web browser on your computer to navigate to the URL and start hosting a game.
2.  **Go to the Lobby:** Proceed until you are in the game lobby.
3.  **Scan the QR Code:** The lobby screen will display a QR code. Open the camera app on your phone and point it at the QR code.
4.  **Join:** Your phone's browser will open a link like `https://trivia.omniflexfitness.com/?pin=1234`. The game PIN will be pre-filled, and you can proceed to enter your name and join the game.
