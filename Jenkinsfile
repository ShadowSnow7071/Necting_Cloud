pipeline {
    agent { label 'windows' }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        VENV_DIR = '.venv'
        PIP_DISABLE_PIP_VERSION_CHECK = '1'
        PYTHONDONTWRITEBYTECODE = '1'

        APP_URL = 'https://necting-cloud.onrender.com'

        DEPLOY_FAILED = 'false'
        HEALTH_FAILED = 'false'
        AUTO_ROLLBACK = 'false'

        HEALTH_RETRIES = '5'
        HEALTH_SLEEP_SECONDS = '10'

        GH_BOT_NAME = 'necting-rollback-bot'
        GH_BOT_EMAIL = 'necting-rollback-bot@users.noreply.github.com'
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

                        bat '''
                            python -m venv %VENV_DIR%

                            call %VENV_DIR%\\Scripts\\activate.bat

                            python -m pip install --upgrade pip
                            pip install -r backend\\requirements.txt
                        '''

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

                        bat '''
                            call %VENV_DIR%\\Scripts\\activate.bat

                            python -m compileall backend
                        '''

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

                            python -m unittest discover \
                                -s backend/tests \
                                -p "test_*.py" \
                                -v
                        '''

                    } else {

                        bat '''
                            call %VENV_DIR%\\Scripts\\activate.bat

                            python -m unittest discover ^
                                -s backend\\tests ^
                                -p "test_*.py" ^
                                -v
                        '''

                    }
                }
            }
        }

        // Espera fija para Render
        stage('Wait Render Deploy') {

            when {
                expression {
                    env.BRANCH_NAME == 'main' ||
                    env.GIT_BRANCH == 'origin/main'
                }
            }

            steps {
                script {

                    echo '[Wait Render Deploy] Esperando 60 segundos para despliegue Render...'

                    sleep time: 60, unit: 'SECONDS'

                    echo '[Wait Render Deploy] Espera terminada.'

                }
            }

            post {
                unsuccessful {
                    script {
                        env.DEPLOY_FAILED = 'true'
                        echo 'Deploy guardrail activado: deploy_failed.'
                    }
                }
            }
        }

        stage('Post-Deploy Health Check') {

            when {
                allOf {
                    expression {
                        env.BRANCH_NAME == 'main' ||
                        env.GIT_BRANCH == 'origin/main'
                    }

                    expression {
                        env.DEPLOY_FAILED != 'true'
                    }
                }
            }

            steps {

                script {

                    catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {

                        def retries = env.HEALTH_RETRIES.toInteger()

                        for (int attempt = 1; attempt <= retries; attempt++) {

                            try {

                                if (isUnix()) {

                                    sh '''
                                        set -e

                                        code=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/health")

                                        echo "[Health Check] status=$code"

                                        test "$code" = "200"
                                    '''

                                } else {

                                    powershell '''

                                        $ErrorActionPreference = "Stop"

                                        $url = "$env:APP_URL/health"

                                        try {

                                            $res = Invoke-WebRequest `
                                                -Uri $url `
                                                -Method Get `
                                                -UseBasicParsing `
                                                -TimeoutSec 20

                                            Write-Host "[Health Check] status=$($res.StatusCode)"

                                            if ($res.StatusCode -ne 200) {
                                                throw "Status inesperado"
                                            }

                                        }
                                        catch {

                                            Write-Host "[Health Check] fallo"

                                            throw

                                        }

                                    '''

                                }

                                echo "[Health Check] OK en intento ${attempt}/${retries}"

                                break

                            }
                            catch (Exception err) {

                                if (attempt == retries) {
                                    throw err
                                }

                                echo "[Health Check] reintento ${attempt}/${retries}"

                                sleep time: env.HEALTH_SLEEP_SECONDS.toInteger(), unit: 'SECONDS'
                            }
                        }
                    }
                }
            }

            post {
                unsuccessful {
                    script {

                        env.HEALTH_FAILED = 'true'

                        echo 'Deploy guardrail activado: health_failed.'

                    }
                }
            }
        }

        stage('Auto Rollback by Git Revert') {

            when {
                allOf {

                    expression {
                        env.BRANCH_NAME == 'main' ||
                        env.GIT_BRANCH == 'origin/main'
                    }

                    expression {
                        env.DEPLOY_FAILED == 'true' ||
                        env.HEALTH_FAILED == 'true'
                    }
                }
            }

            steps {

                script {

                    def lastMessage = isUnix()
                        ? sh(
                            script: 'git --no-pager log -1 --pretty=%B',
                            returnStdout: true
                        ).trim()
                        : powershell(
                            script: 'git --no-pager log -1 --pretty=%B',
                            returnStdout: true
                        ).trim()

                    if (lastMessage.contains('[auto-rollback]')) {

                        echo 'Guardrail anti-loop activo.'

                        return
                    }

                    def rollbackReason =
                        env.DEPLOY_FAILED == 'true'
                        ? 'deploy_failed'
                        : 'health_failed'

                    withCredentials([
                        string(
                            credentialsId: 'GH_BOT_TOKEN',
                            variable: 'GH_BOT_TOKEN'
                        )
                    ]) {

                        if (isUnix()) {

                            sh """
                                set -e

                                git config user.name "${GH_BOT_NAME}"
                                git config user.email "${GH_BOT_EMAIL}"

                                git revert --no-commit ${GIT_COMMIT}

                                git commit -m "[auto-rollback] Revert ${GIT_COMMIT} (${rollbackReason})"

                                auth_header=\$(printf "x-access-token:${GH_BOT_TOKEN}" | base64 | tr -d '\\n')

                                git -c http.https://github.com/.extraheader="AUTHORIZATION: basic \${auth_header}" push origin HEAD:${BRANCH_NAME}
                            """

                        } else {

                            powershell '''

                                $ErrorActionPreference = "Stop"

                                git config user.name "$env:GH_BOT_NAME"
                                git config user.email "$env:GH_BOT_EMAIL"

                                git revert --no-commit $env:GIT_COMMIT

                                git commit -m "[auto-rollback] Revert $env:GIT_COMMIT"

                                $bytes = [System.Text.Encoding]::UTF8.GetBytes("x-access-token:$env:GH_BOT_TOKEN")

                                $authHeader = [Convert]::ToBase64String($bytes)

                                git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $authHeader" push origin "HEAD:$env:BRANCH_NAME"

                            '''

                        }
                    }

                    env.AUTO_ROLLBACK = 'true'

                    echo "Auto rollback completado. Motivo=${rollbackReason}"
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

            script {

                echo "Deploy guardrails => deploy_failed=${env.DEPLOY_FAILED}, health_failed=${env.HEALTH_FAILED}, auto_rollback=${env.AUTO_ROLLBACK}"

                if (env.DEPLOY_FAILED == 'true') {
                    echo 'Resultado deploy_failed.'
                }

                if (env.HEALTH_FAILED == 'true') {
                    echo 'Resultado health_failed.'
                }
            }
        }
    }
}
