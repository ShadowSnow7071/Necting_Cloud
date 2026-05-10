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

        // URL publica real del backend desplegado en Render
        APP_URL = 'https://necting-cloud.onrender.com'

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

        stage('Wait Render Deploy') {

            when {
                expression {
                    env.BRANCH_NAME == 'main' ||
                    env.GIT_BRANCH == 'origin/main'
                }
            }

            steps {

                echo '[Wait Render Deploy] Esperando 60 segundos para despliegue Render...'

                sleep time: 60, unit: 'SECONDS'

                echo '[Wait Render Deploy] Espera terminada.'
            }
        }

        stage('Post-Deploy Health Check + Auto Rollback') {

            when {
                expression {
                    env.BRANCH_NAME == 'main' ||
                    env.GIT_BRANCH == 'origin/main'
                }
            }

            steps {

                script {

                    def retries = env.HEALTH_RETRIES.toInteger()
                    def healthOk = false

                    for (int attempt = 1; attempt <= retries; attempt++) {

                        try {

                            if (isUnix()) {

                                sh '''
                                    set -e

                                    echo "[Health Check] Checking URL: ${APP_URL}/health"

                                    code=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/health")

                                    echo "[Health Check] status=$code"

                                    test "$code" = "200"
                                '''

                            } else {

                                powershell '''

                                    $ErrorActionPreference = "Stop"

                                    $url = "$env:APP_URL/health"

                                    Write-Host "[Health Check] Checking URL: $url"

                                    $res = Invoke-WebRequest `
                                        -Uri $url `
                                        -Method Get `
                                        -UseBasicParsing `
                                        -TimeoutSec 20

                                    Write-Host "[Health Check] status=$($res.StatusCode)"

                                    if ($res.StatusCode -ne 200) {
                                        throw "Status inesperado"
                                    }

                                '''

                            }

                            echo "[Health Check] OK en intento ${attempt}/${retries}"

                            healthOk = true

                            break

                        }
                        catch (Exception err) {

                            echo "[Health Check] fallo en intento ${attempt}/${retries}"

                            if (attempt < retries) {

                                sleep time: env.HEALTH_SLEEP_SECONDS.toInteger(), unit: 'SECONDS'

                            }
                        }
                    }

                    if (!healthOk) {

                        echo 'Deploy guardrail activado: health_failed.'

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

                            error('Rollback detenido por anti-loop.')
                        }

                        def targetBranch = (env.BRANCH_NAME?.trim())
                            ? env.BRANCH_NAME.trim()
                            : 'main'

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

                                    git fetch origin ${targetBranch}
                                    git checkout -B ${targetBranch} origin/${targetBranch}

                                    parent_count=\$(git show --no-patch --format=%P \$GIT_COMMIT | wc -w | tr -d ' ')
                                    if [ "\$parent_count" -gt "1" ]; then
                                      git revert -m 1 --no-commit \$GIT_COMMIT
                                    else
                                      git revert --no-commit \$GIT_COMMIT
                                    fi

                                    git commit -m "[auto-rollback] Revert \$GIT_COMMIT (health_failed)"

                                    auth_header=\$(printf "x-access-token:${GH_BOT_TOKEN}" | base64 | tr -d '\\n')

                                    git -c http.https://github.com/.extraheader="AUTHORIZATION: basic \${auth_header}" push origin HEAD:${targetBranch}
                                """

                            } else {

                                powershell '''

                                    $ErrorActionPreference = "Stop"

                                    Write-Host "[Rollback] Starting rollback process"

                                    git config user.name "$env:GH_BOT_NAME"
                                    git config user.email "$env:GH_BOT_EMAIL"

                                    $targetBranch = if ([string]::IsNullOrWhiteSpace($env:BRANCH_NAME)) { "main" } else { $env:BRANCH_NAME }

                                    Write-Host "[Rollback] Target branch: $targetBranch"

                                    git fetch origin $targetBranch
                                    git checkout -B $targetBranch origin/$targetBranch

                                    Write-Host "[Rollback] Checked out to $targetBranch"

                                    $parents = git show --no-patch --format=%P $env:GIT_COMMIT
                                    Write-Host "[Rollback] Parents: $parents"

                                    if ($parents -match ' ') {
                                        Write-Host "[Rollback] Detected merge commit, using -m 1"
                                        git revert -m 1 --no-commit $env:GIT_COMMIT
                                    } else {
                                        Write-Host "[Rollback] Not a merge commit"
                                        git revert --no-commit $env:GIT_COMMIT
                                    }

                                    Write-Host "[Rollback] Revert completed, committing"

                                    git commit -m "[auto-rollback] Revert $env:GIT_COMMIT (health_failed)"

                                    Write-Host "[Rollback] Commit created"

                                    $bytes = [System.Text.Encoding]::UTF8.GetBytes("x-access-token:$env:GH_BOT_TOKEN")

                                    $authHeader = [Convert]::ToBase64String($bytes)

                                    Write-Host "[Rollback] Pushing to origin/$targetBranch"

                                    git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $authHeader" push origin "HEAD:$targetBranch"

                                    Write-Host "[Rollback] Push completed"

                                '''

                            }
                        }

                        error('Health check failed. Rollback ejecutado.')
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
