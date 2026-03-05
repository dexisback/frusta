import env from "./config/env.js" //fix: first env is validated before app/prisma init
import app from "./app.js"
app.listen(env.PORT, ()=>{console.log(`up and runnin`)})

