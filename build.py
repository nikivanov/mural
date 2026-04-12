import os
Import("env")

print("Transpiling TS worker code")
env.Execute("rm -rf data/www || true")
currentPath = os.getcwd()

os.chdir('./tsc')
env.Execute("npm run build")
if not os.path.exists("../data/www/worker/"):
    os.makedirs("../data/www/worker/")
env.Execute("cp dist_packed/main.js ../data/www/worker/worker.js")
os.chdir(currentPath)

print("Building React UI")
os.chdir('./ui')
env.Execute("npm run build")
os.chdir(currentPath)