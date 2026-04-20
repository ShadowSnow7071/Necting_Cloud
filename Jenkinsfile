pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        VENV_DIR = '.venv'
        PIP_DISABLE_PIP_VERSION_CHECK = '1'
        PYTHONDONTWRITEBYTECODE = '1'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Preparar entorno') {
            steps {
                script {
                    if (isUnix()) {
                        sh '''
                            python3 -m venv ${VENV_DIR}
                            . ${VENV_DIR}/bin/activate
                            python -m pip install --upgrade pip
                            pip install -r backend/requirements.txt
                        '''
                    } else {
                        bat """
                            python -m venv %VENV_DIR%
                            call %VENV_DIR%\\Scripts\\activate.bat
                            python -m pip install --upgrade pip
                            pip install -r backend\\requirements.txt
                        """
                    }
                }
            }
        }

        stage('Validacion sintactica') {
            steps {
                script {
                    if (isUnix()) {
                        sh '''
                            . ${VENV_DIR}/bin/activate
                            python -m compileall backend
                        '''
                    } else {
                        bat """
                            call %VENV_DIR%\\Scripts\\activate.bat
                            python -m compileall backend
                        """
                    }
                }
            }
        }

        stage('Pruebas smoke') {
            steps {
                script {
                    if (isUnix()) {
                        sh '''
                            . ${VENV_DIR}/bin/activate
                            python -m unittest discover -s backend/tests -p "test_*.py" -v
                        '''
                    } else {
                        bat """
                            call %VENV_DIR%\\Scripts\\activate.bat
                            python -m unittest discover -s backend\\tests -p "test_*.py" -v
                        """
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                if (isUnix()) {
                    sh 'rm -rf ${VENV_DIR} || true'
                } else {
                    bat 'if exist %VENV_DIR% rmdir /s /q %VENV_DIR%'
                }
            }
        }
    }
}
