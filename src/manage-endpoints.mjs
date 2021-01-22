import multer from "multer"
import fs from "fs"
import path from "path"
import { DataTypes, ImageExtensions } from "./data-types"

const cleanupFile = file => {
    fs.unlinkSync(file.path)
}

const handleUploadedFile = (file, dataSet) => {
    // determine file extension
    let extension = null
    if (dataSet.type === DataTypes.IMAGE) {
        extension = ImageExtensions[file.mimetype] // normalises the extension of image files
    } else if (dataSet.type === DataTypes.BINARY) {
        extension = path.extname(file.originalname).toLowerCase()
    }

    if (extension != null) {
        // move image file to final destination
        const targetFile = path.join(file.destination, `${dataSet._id}${extension}`)
        fs.renameSync(file.path, targetFile)
        return targetFile
    }

    // no extension, upload failed
    cleanupFile(file)
    return null
}

const registerEndpoints = (app, dataSetStore, authMiddleware, options = {}) => {
    // extract options
    const apiPrefix = options.apiPrefix || "/api/data-sets"
    const dataFolder = options.dataFolder || "_data"

    // multipart/form-data middleware to parse the uploaded file
    const uploadMiddleware = multer({ dest: dataFolder }).single("file")

    // upload new file
    app.post(apiPrefix, [authMiddleware, uploadMiddleware], (req, res) => {
        // parse payload
        const dataSet = JSON.parse(req.body.meta)
        dataSet.userId = req.currentUser.email || req.currentUser.username

        if (dataSet.type === DataTypes.TIME_SERIES) {
            // handle time series upload (csv)
            const fileContent = fs.readFileSync(req.file.path, { encoding: "UTF-8" })
            const lines = fileContent.split("\n")
            // remove CSV header
            lines.splice(0, 1)
            const rows = []
            lines.forEach(line => {
                if (line.trim() === "") {
                    return
                }
                const row = line.split(",").map(value => {
                    let parsedValue
                    if (value.indexOf(".") !== -1) {
                        parsedValue = parseFloat(value) // parse to float
                    } else {
                        parsedValue = parseInt(value, 10) // parse to int
                    }
                    if (isNaN(parsedValue)) {
                        parsedValue = value // fallback to string
                    }
                    return parsedValue
                })
                rows.push(row)
            })
            dataSet.payload.data = rows
        } else if (dataSet.type === DataTypes.IMAGE) {
            // check file extension
            const extension = ImageExtensions[req.file.mimetype]
            if (extension == null) {
                res.status(500).send({ status: "Could not recognise mime type of image" })
                cleanupFile(req.file)
                return
            }
        } else if (dataSet.type === DataTypes.JSON) {
            // parse and store the payload
            dataSet.payload.data = JSON.parse(fs.readFileSync(req.file.path, { encoding: "UTF-8" }))
        }

        dataSetStore
            .create(dataSet)
            .then(dataSetId => dataSetStore.getMeta(dataSetId))
            .then(createdDataSet => {
                // handle uploaded file
                const targetFile = handleUploadedFile(req.file, createdDataSet)
                if (targetFile === null) {
                    // no file handling required
                    return createdDataSet
                }
                // update final path of file
                return dataSetStore
                    .updateTargetFile(createdDataSet._id, targetFile, req.file.mimetype)
                    .then(() => createdDataSet)
            })
            .then(createdDataSet => {
                // return response
                res.send(createdDataSet)
            })
            .catch(err => {
                console.log("Error creating data set", err)
                res.status(500).send({
                    status: "Error uploading data set",
                })
            })
    })

    // update data set meta
    app.post(`${apiPrefix}/:dataSetId`, authMiddleware, (req, res) => {
        const { dataSetId } = req.params
        const { body } = req
        dataSetStore.getMeta(dataSetId).then(dataSet => {
            if (dataSet == null) {
                res.status(404).send({
                    status: "Not found",
                })
                return
            }
            dataSetStore
                .updateDataSet(dataSetId, body)
                .then(() => dataSetStore.getMeta(dataSetId))
                .then(dataSetMeta => {
                    res.send(dataSetMeta)
                })
                .catch(err => {
                    console.log("Error updating data set", err)
                    res.status(500).send({
                        status: "Error updating data set",
                    })
                })
        })
    })

    // delete data set
    app.delete(`${apiPrefix}/:dataSetId`, authMiddleware, (req, res) => {
        const { dataSetId } = req.params
        dataSetStore.getMeta(dataSetId).then(existing => {
            if (existing == null) {
                res.status(404).send({ status: "Not found" })
                return
            }
            dataSetStore
                .delete(dataSetId)
                .then(() => {
                    if (existing.payload.targetFile != null) {
                        // delete images and binaries
                        fs.unlinkSync(existing.payload.targetFile)
                    }
                    res.send({
                        deleted: true,
                        dataSetId,
                    })
                })
                .catch(err => {
                    console.log("Error deleting data set", err)
                    res.status(500).send({
                        status: "Error deleting data set",
                    })
                })
        })
    })
}

export default registerEndpoints
