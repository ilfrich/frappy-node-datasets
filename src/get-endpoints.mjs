import fs from "fs"
import { DataTypes, ImageExtensions } from "./data-types"

const checkDataSet = (dataSet, res, type = null) => {
    if (dataSet == null) {
        res.status(404).send({
            status: "Not found",
        })
        return false
    }
    if (type != null) {
        if (typeof type === "string" && dataSet.type !== type) {
            res.status(400).send({
                status: "Invalid request",
            })
            return false
        }
        if (Array.isArray(type) && type.indexOf(dataSet.type) === -1) {
            res.status(400).send({
                status: "Invalid request",
            })
            return false
        }
    }
    return true
}

const registerEndpoints = (app, dataSetStore, authMiddleware, options = {}) => {
    // extract options
    const apiPrefix = options.apiPrefix || "/api/data-sets"
    const allowPublicBinaryAccess = options.allowPublicBinaryAccess || false

    // get list of data sets
    app.get(apiPrefix, authMiddleware, (req, res) => {
        const { assignment, assignmentType, dataType } = req.query
        let basePromise
        if (assignment != null && dataType != null) {
            basePromise = dataSetStore.findByAssignmentAndType(assignment, dataType)
        } else if (assignment != null && assignmentType != null) {
            basePromise = dataSetStore.findByAssignmentType(assignment, assignmentType)
        } else if (assignment != null) {
            basePromise = dataSetStore.findByAssignment(assignment)
        } else if (dataType != null) {
            basePromise = dataSetStore.findByType(dataType)
        } else {
            basePromise = dataSetStore.getAllMetaData()
        }

        basePromise
            .then(dataSets => {
                res.send(dataSets)
            })
            .catch(err => {
                console.log("Error retrieving data sets", err)
                res.status(500).send({
                    status: "Error retrieving data sets",
                })
            })
    })

    // get meta info of data set without payload
    app.get(`${apiPrefix}/:dataSetId/meta`, authMiddleware, (req, res) => {
        dataSetStore
            .getMeta(req.params.dataSetId)
            .then(dataSet => {
                if (!checkDataSet(dataSet, res)) {
                    return
                }
                res.send(dataSet)
            })
            .catch(err => {
                console.log("Error retrieving data set", err)
                res.status(500).send({
                    status: "Error retrieving data set",
                })
            })
    })

    // retrieve full data set
    app.get(`${apiPrefix}/:dataSetId`, authMiddleware, (req, res) => {
        dataSetStore
            .get(req.params.dataSetId)
            .then(dataSet => {
                if (!checkDataSet(dataSet, res)) {
                    return
                }
                res.send(dataSet)
            })
            .catch(err => {
                console.log("Error loading data set", err)
                res.status(500).send({
                    status: "Error loading data set",
                })
            })
    })

    app.get(`${apiPrefix}/:dataSetId/relations`, authMiddleware, (req, res) => {
        dataSetStore
            .get(req.params.dataSetId)
            .then(existing => {
                if (existing == null) {
                    res.status(404).send({
                        status: "Not found",
                    })
                    return null
                }
                return dataSetStore.findByRelation(req.params.dataSetId)
            })
            .then(dataSetList => {
                if (dataSetList != null) {
                    res.send(dataSetList)
                }
            })
            .catch(err => {
                console.log("Error loading relations for data set", err)
                res.status(500).send({
                    status: "Error loading data set relations",
                })
            })
    })

    // determine what middleware to use for binary endpoints (if public access is allowed, a dummy middleware is used)
    const customBinaryMiddleware = (req, res, next) => {
        dataSetStore.get(req.params.dataSetId).then(dataSet => {
            req.currentDataSet = dataSet
            // we need to check the basics
            if (!checkDataSet(dataSet, res, [DataTypes.BINARY, DataTypes.IMAGE])) {
                return
            }
            if (dataSet.payload != null && dataSet.payload.publicFlag === true) {
                next()
                return
            }
            authMiddleware(req, res, next)
        })
    }
    const publicBinaryMiddleware = (req, res, next) => {
        dataSetStore.get(req.params.dataSetId).then(dataSet => {
            req.currentDataSet = dataSet
            next()
        })
    }
    const binaryMiddleware = allowPublicBinaryAccess ? publicBinaryMiddleware : customBinaryMiddleware

    // retrieve image file
    app.get(`${apiPrefix}/:dataSetId/image`, binaryMiddleware, (req, res) => {
        const dataSet = req.currentDataSet
        // check data set
        if (!checkDataSet(dataSet, res, DataTypes.IMAGE)) {
            return
        }
        const image = fs.readFileSync(dataSet.payload.targetFile)
        // determine mime type
        let finalMime = dataSet.payload.mimeType
        if (finalMime == null) {
            // fallback in case of old images (legacy)
            Object.keys(ImageExtensions).forEach(mime => {
                if (dataSet.payload.targetFile.toLowerCase().endsWith(ImageExtensions[mime])) {
                    finalMime = mime
                }
            })
        }
        if (finalMime == null) {
            // should theoretically be impossible
            console.error("Could not determine mime type of image", req.params.dataSetId)
            res.status(500).send({
                status: "Unable to send image",
            })
        }
        // send file
        res.contentType(finalMime)
        res.end(image, "binary")
    })

    // retrieve binary file
    app.get(`${apiPrefix}/:dataSetId/binary`, binaryMiddleware, (req, res) => {
        const dataSet = req.currentDataSet
        // check data set
        if (!checkDataSet(dataSet, res, [DataTypes.BINARY, DataTypes.IMAGE])) {
            return
        }
        const binary = fs.readFileSync(dataSet.payload.targetFile)
        const { mimeType } = dataSet.payload
        // send file
        res.contentType(mimeType)
        res.end(binary, "binary")
    })
}

export default registerEndpoints
