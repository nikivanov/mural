import gzip
import os
import shutil
Import("env")

print("Transpiling TS worker code")
env.Execute("rm -rf data/www || true")
currentPath = os.getcwd()

os.chdir('./worker')
env.Execute("npm run build")
if not os.path.exists("../data/www/worker/"):
    os.makedirs("../data/www/worker/")
env.Execute("cp dist_packed/main.js ../data/www/worker/worker.js")
os.chdir(currentPath)

print("Building React UI")
os.chdir('./ui')
env.Execute("npm run build")
os.chdir(currentPath)

print("Gzip compressing static assets")
for dirpath, _, filenames in os.walk("data/www"):
    for filename in filenames:
        src = os.path.join(dirpath, filename)
        dst = src + ".gz"
        with open(src, "rb") as f_in, gzip.open(dst, "wb", compresslevel=9) as f_out:
            shutil.copyfileobj(f_in, f_out)
        os.remove(src)