pipeline {
  agent any

  environment {
    DOCKER_REGISTRY = 'alansibi'
    BACKEND_IMAGE = "${DOCKER_REGISTRY}/maas-backend"
    FRONTEND_IMAGE = "${DOCKER_REGISTRY}/maas-frontend"
    IMAGE_TAG = "${env.BUILD_NUMBER}"
    MINIKUBE_HOME = '/home/vboxuser/.minikube'
    KUBECONFIG = '/home/vboxuser/.kube/config'
    PATH = "/usr/local/bin:/home/vboxuser/.local/bin:${env.PATH}"
    DOCKER_BUILDKIT = '0'
  }

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
    timeout(time: 90, unit: 'MINUTES')
  }

  stages {
    stage('Backend — Test') {
      steps {
        dir('backend') {
          sh '''
            npm ci --prefer-offline --no-audit
            npm test -- --passWithNoTests
          '''
        }
      }
    }

    stage('Docker — Build Backend') {
      steps {
        sh '''
          set -e
          docker build --pull=false \
            -t "${BACKEND_IMAGE}:${IMAGE_TAG}" \
            -t "${BACKEND_IMAGE}:latest" \
            ./backend
        '''
      }
    }

    stage('Docker — Build Frontend') {
      steps {
        sh '''
          set -e
          docker build --pull=false \
            --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 \
            -t "${FRONTEND_IMAGE}:${IMAGE_TAG}" \
            -t "${FRONTEND_IMAGE}:latest" \
            ./frontend
        '''
      }
    }

    stage('Docker — Push') {
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'dockerhub-credentials',
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS'
          )
        ]) {
          sh '''
            set -e
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
            docker push "${BACKEND_IMAGE}:${IMAGE_TAG}"
            docker push "${BACKEND_IMAGE}:latest"
            docker push "${FRONTEND_IMAGE}:${IMAGE_TAG}"
            docker push "${FRONTEND_IMAGE}:latest"
            docker logout || true
          '''
        }
      }
    }

    stage('Deploy — Kubernetes') {
      steps {
        sh '''
          set -e
          export MINIKUBE_HOME=/home/vboxuser/.minikube
          export KUBECONFIG=/home/vboxuser/.kube/config
          export PATH="/usr/local/bin:/home/vboxuser/.local/bin:$PATH"

          if ! minikube status 2>/dev/null | grep -q "host: Running"; then
            minikube start --cpus=2 --memory=3072 --driver=docker \
              --base-image=docker.io/kicbase/stable:v0.0.50 \
              --wait=apiserver
          fi

          kubectl cluster-info

          minikube image load "${BACKEND_IMAGE}:${IMAGE_TAG}"
          minikube image load "${FRONTEND_IMAGE}:${IMAGE_TAG}"

          kubectl apply -f k8s/secret.yaml -f k8s/postgres.yaml -f k8s/backend.yaml -f k8s/frontend.yaml -f k8s/hpa.yaml
          kubectl set image deployment/maas-backend backend="${BACKEND_IMAGE}:${IMAGE_TAG}"
          kubectl set image deployment/maas-frontend frontend="${FRONTEND_IMAGE}:${IMAGE_TAG}"
          kubectl wait --for=condition=available deployment/maas-postgres --timeout=180s
          kubectl rollout status deployment/maas-backend --timeout=300s
          kubectl rollout status deployment/maas-frontend --timeout=300s
          kubectl get pods -l 'app in (maas-backend,maas-frontend,maas-postgres)'
        '''
      }
    }
  }

  post {
    success {
      echo "Deployed ${BACKEND_IMAGE}:${IMAGE_TAG} and ${FRONTEND_IMAGE}:${IMAGE_TAG}"
    }
    failure {
      echo 'Pipeline failed — check stage logs above.'
    }
  }
}
