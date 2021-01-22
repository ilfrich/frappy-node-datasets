# Node Data Sets

NodeJS functionality to Manage And Use Data Sets

## Usage

This example uses the MongoDB store to store datasets. You can replace that if needed with the MySQL store for data sets.
You also can use your own auth middleware if you desire.

This example only works with: `npm i -S @frappy/node-authentication @frappy/js-mongo-dataset-store @frappy/node-datasets mongodb express body-parser`

```javascript
import express from "express"
import bodyParser from "body-parser"
import nodeDataSet from "@frappy/node-datasets"
import { authMiddleware } from "@frappy/node-authentication"
import { DataSetStore } from "@frappy/js-mongo-dataset-store"
import mongodb from "mongodb"

// app configuration with default fallbacks
const HTTP_PORT = process.env.PORT || 3000  // port with fallback to 3000
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017"

// create express app
const app = express()
// mount parser for application/json content
app.use(bodyParser.json({ limit: "100mb" }))


// create mongoDB connection
mongodb.MongoClient.connect(MONGO_URL, {
    useNewUrlParser: true,
}).then(client => {
	// initialise store
    const dataSetStore = new DataSetStore(client, "playbook", "dataSets")
	
    // register endpoints
	
    const tokenCache = {}
    // requires permission "data" to manage data sets
    nodeDataSet.registerAdminEndpoints(app, dataSetStore, authMiddleware("data", tokenCache))  
    nodeDataSet.registerGetEndpoints(app, dataSetStore, authMiddleware(null, tokenCache))
})


// Start the app
app.listen(HTTP_PORT, () => {
    console.log(`Listening on port ${HTTP_PORT}`)
})
```

## Options

**`registerAdminEndpoints`** has the following options:

- `apiPrefix` - default `/api/data-sets` - the prefix under which to register the API endpoints for data set administration
- `dataFolder` - default `_data` - the name / path of the folder, where to store uploaded images. 
 Images are by default stored in the file system, with only meta information being stored in the database.
 `_data` refers to the folder `_data` on the root of the project (where your package.json is located).
 
**`registerGetEndpoints`** has the following options:

- `apiPrefix` - default `/api/data-sets` - the prefix under which to register the API endpoints for data set retrieval.
- `allowPublicBinaryAccess` - default `false` - a flag that allows any user (also unauthenticated users) to download
 binary and image data set files.
