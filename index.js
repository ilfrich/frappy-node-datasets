const manageEndpoints = require("./dist/manage-endpoints")
const getEndpoints = require("./dist/get-endpoints")
const dataTypes = require("./dist/data-types")

module.exports = {
    registerAdminEndpoints: manageEndpoints.default,
    registerGetEndpoints: getEndpoints.default,
    DataTypes: dataTypes.DataTypes,
    AllTypes: dataTypes.AllTypes,
}
