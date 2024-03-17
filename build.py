import os
Import("env")

print("Transpiling TS code")
env.Execute("rm data/www/worker/* || true")
currentPath = os.getcwd()

os.chdir('./tsc')
env.Execute("npm run build")
os.makedirs("../data/www/worker/")
env.Execute("cp dist/main.js ../data/www/worker/worker.js")
os.chdir(currentPath)