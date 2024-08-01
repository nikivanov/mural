import os
Import("env")

print("Transpiling TS code")
env.Execute("rm data/www/worker/* || true")
currentPath = os.getcwd()

os.chdir('./tsc')
env.Execute("npm run build")
if not os.path.exists("../data/www/worker/"):
    os.makedirs("../data/www/worker/")
env.Execute("cp dist_packed/main.js ../data/www/worker/worker.js")
os.chdir(currentPath)