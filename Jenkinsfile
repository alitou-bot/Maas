pipeline {
  agent any

  environment {
    DOCKER_REGISTRY = 'alansibi'
    BACKEND_IMAGE = "${DOCKER_REGISTRY}/maas-backend"
    FRONTEND_IMAGE = "${DOCKER_REGISTRY}/maas-frontend"
    IMAGE_TAG = "${env.BUILD_NUMBER}"
    KUBECONFIG = "${env.HOME}/.kube/config"
  }

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Backend — Build') {
      steps {
        dir('backend') {
          sh 'node --version && npm --version'
          sh 'npm ci'
          sh 'npm run build'
        }
      }
    }

    stage('Backend — Test') {
      steps {
        dir('backend') {
          sh 'npm test -- --passWithNoTests'
        }
      }
    }

    stage('Frontend — Build') {
      steps {
        dir('frontend') {
          sh 'npm ci'
          sh 'npm run build'
        }
      }
    }

    stage('Docker — Build & Push') {
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
            docker build -t "${BACKEND_IMAGE}:${IMAGE_TAG}" -t "${BACKEND_IMAGE}:latest" ./backend
            docker build \
              --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 \
              -t "${FRONTEND_IMAGE}:${IMAGE_TAG}" \
              -t "${FRONTEND_IMAGE}:latest" \
              ./frontend
            docker push "${BACKEND_IMAGE}:${IMAGE_TAG}"
            docker push "${BACKEND_IMAGE}:latest"
            docker push "${FRONTEND_IMAGE}:${IMAGE_TAG}"
            docker push "${FRONTEND_IMAGE}:latest"
          '''
        }
      }
    }

    stage('Deploy — Kubernetes') {
      steps {
        sh '''
          set -e
          kubectl cluster-info
          kubectl set image deployment/maas-backend \
            backend="${BACKEND_IMAGE}:${IMAGE_TAG}" \
            --record
          kubectl set image deployment/maas-frontend \
            frontend="${FRONTEND_IMAGE}:${IMAGE_TAG}" \
            --record
          kubectl rollout status deployment/maas-backend --timeout=300s
          kubectl rollout status deployment/maas-frontend --timeout=300s
          kubectl get pods -l 'app in (maas-backend,maas-frontend)'
        '''
      }
    }
  }

  post {
    always {
      sh 'docker logout || true'
    }
    success {
      echo "Deployed ${BACKEND_IMAGE}:${IMAGE_TAG} and ${FRONTEND_IMAGE}:${IMAGE_TAG}"
    }
    failure {
      echo 'Pipeline failed — check stage logs above.'
    }
  }
}
