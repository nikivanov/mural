Import("env")

print("Transpiling TS code")
env.Execute("tsc -p tsc/tsconfig.json")