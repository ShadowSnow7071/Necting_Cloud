# Integracion de Jenkins

Este proyecto incluye un `Jenkinsfile` para automatizar validaciones basicas del backend.

## Pipeline incluida

La pipeline ejecuta estos pasos:

1. `Checkout`: descarga el codigo desde tu repositorio.
2. `Preparar entorno`: crea un entorno virtual Python e instala dependencias.
3. `Validacion sintactica`: corre `python -m compileall backend`.
4. `Pruebas smoke`: ejecuta pruebas basicas con `unittest`.

## Requisitos del agente de Jenkins

- Tener Python 3 instalado y accesible en `PATH`.
- Permisos para crear y eliminar carpetas en el workspace.

## Como activarla en Jenkins

1. Crea un job tipo **Pipeline** (o **Multibranch Pipeline**).
2. En *Pipeline Definition*, selecciona *Pipeline script from SCM*.
3. Apunta a tu repositorio Git.
4. Deja `Jenkinsfile` como ruta del script.
5. Guarda y ejecuta *Build Now*.

## Siguiente paso recomendado

Cuando tengas pruebas de integracion o despliegue, agrega nuevas etapas en `Jenkinsfile` para:

- construir una imagen Docker,
- publicar artefactos,
- y desplegar en tu entorno objetivo.
