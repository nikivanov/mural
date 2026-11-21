import gzip
import os
import shutil
Import("env")

projectDir = env.subst("$PROJECT_DIR")
workerDir = os.path.join(projectDir, "worker")
uiDir = os.path.join(projectDir, "ui")
wwwDir = os.path.join(projectDir, "data", "www")
wwwWorkerDir = os.path.join(wwwDir, "worker")

# (source in worker/dist_packed/, destination in data/www/worker/)
workerFiles = [
    ("main.js", "worker.js"),
    ("oneline.js", "oneline.js"),
    ("oneline.wasm", "oneline.wasm"),
]


def fail(step):
    print("ERROR: %s failed. Make sure you have run 'npm install' in both worker/ and ui/." % step)
    env.Exit(1)


print("Transpiling TS worker code")
shutil.rmtree(wwwDir, ignore_errors=True)
currentPath = os.getcwd()

os.chdir(workerDir)
try:
    result = env.Execute("npm run build")
finally:
    os.chdir(currentPath)
if result != 0:
    fail("Worker build (npm run build in worker/)")

os.makedirs(wwwWorkerDir, exist_ok=True)
for srcName, dstName in workerFiles:
    srcPath = os.path.join(workerDir, "dist_packed", srcName)
    if not os.path.isfile(srcPath):
        fail("Worker build (worker/dist_packed/%s not found)" % srcName)
    shutil.copyfile(srcPath, os.path.join(wwwWorkerDir, dstName))

print("Building React UI")
os.chdir(uiDir)
try:
    result = env.Execute("npm run build")
finally:
    os.chdir(currentPath)
if result != 0 or not os.path.isfile(os.path.join(wwwDir, "index.html")):
    fail("UI build (npm run build in ui/)")

print("Gzip compressing static assets")
for dirpath, _, filenames in os.walk("data/www"):
    for filename in filenames:
        src = os.path.join(dirpath, filename)
        dst = src + ".gz"
        with open(src, "rb") as f_in, gzip.open(dst, "wb", compresslevel=9) as f_out:
            shutil.copyfileobj(f_in, f_out)
        os.remove(src)