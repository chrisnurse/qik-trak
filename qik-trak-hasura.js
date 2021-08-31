const axios = require("axios");
const fs = require('fs');

class QikTrakHasura {

    constructor(config) {
        if(!config)
            throw ("config is required")

        this.config = config;
    }


    //--------------------------------------------------------------------------------------------------------------------------
    // Execute a list of SQL scripts
    async executeSqlScript(scriptFilename) {
        var content = fs.readFileSync(scriptFilename, { encoding: "utf8" });

        if (content.trim().length > 0) {
            await this.runSQL_Query(content);
        }
    }


    //--------------------------------------------------------------------------------------------------------------------------
    // Execute a Postgres SQL query via the Hasura API
    async runSQL_Query(sql_statement) {
        if (!sql_statement)
            throw ("sql_statement is required");

        var sqlQuery = {
            type: "run_sql",
            args: {
                sql: sql_statement
            }
        };

        return await this.runGraphQL_Query('/v2/query', sqlQuery)
            .then(results => {
                return results.data.result;
            }).catch(e => {
                this.config.Logger.Log("");
                this.config.Logger.Log("");
                this.config.Logger.Log("--------------------------------------------------------------");
                this.config.Logger.Log("");
                this.config.Logger.Log("QIK-TRAK: ERROR");
                this.config.Logger.Log("");
                this.config.Logger.Log("SQL QUERY FAILED TO EXECUTE: ");
                this.config.Logger.Log("");
                this.config.Logger.Log("ENDPOINT ADDRESS : " + this.config.hasuraEndpoint);
                this.config.Logger.Log("");

                if (!e.response)
                    this.config.Logger.Log("Error Message : " + e);
                else
                    this.config.Logger.Log("Error Message : " + e.response.data.internal.error.message);

                this.config.Logger.Log("");
                this.config.Logger.Log("SQL Statement:");
                this.config.Logger.Log("");
                this.config.Logger.Log(sql_statement);
                this.config.Logger.Log("");
                this.config.Logger.Log("Check for SQL syntax errors. Test the query in your admin tool.");
                this.config.Logger.Log("");
                this.config.Logger.Log("--------------------------------------------------------------");
            });
    }


    //--------------------------------------------------------------------------------------------------------------------------
    // Execute a GraphQL query via the Hasura API
    async runGraphQL_Query(endpoint, query) {
      
        if (!endpoint)
            throw ("endpoint is required");
        
            if (!query)
            throw ("query is required");

        if (!this.config.hasuraAdminSecret)
            throw ("hasuraAdminSecret is required");

        const requestConfig = {
            headers: {
                'X-Hasura-Admin-Secret': this.config.hasuraAdminSecret,
            }
        }

        return await axios.post(this.config.hasuraEndpoint + endpoint, query, requestConfig)
            .then(result => {
                return result;
            });
    }


    //--------------------------------------------------------------------------------------------------------------------------
    // Generate views that surface JSON attributes as SQL columns
    //
    // For example: Imagine we have a data table for IoT devices, and the devices send data to the database as JSON. The table might have a message_id and then message contant in JSON.
    //              we want to surface JSON values as SQL data, else GraphQL can't see it or query it.
    //
    async generateJsonView(view) {
        if (view.relationships) {
            view.relationships.map(relationship => {
                this.config.relationships.push({ ...relationship, srcTable: view.name });
            });
        }

        const view_header =
`
DROP VIEW IF EXISTS "${this.config.targetSchema}"."${view.name}";
CREATE VIEW "${this.config.targetSchema}"."${view.name}" AS
`;

        const view_footer =
`
COMMENT ON VIEW "${this.config.targetSchema}"."${view.name}" IS '${view.description}';
`;

        // Build the SQL statement according to the specified JSON columns
        // The columns list is optional
        var view_columns = ""

        if (view.columns) {
            var view_columns = ","

            view.columns.jsonValues.map(col => {
                view_columns +=
`CAST(${view.columns.jsonColumn} ->> '${col.jsonName}' AS ${col.sqlType}) AS "${col.sqlName}",`;
            });

        }

        var sql_statement = 
`
 ${view_header}
 ${view.query.select.trim().replace(/,\s*$/, "")}
 ${view_columns.trim().replace(/,\s*$/, "")}
 ${view.query.from}
 ${view.query.join}
 ${view.query.where}
 ${view.query.orderBy};
 ${view_footer};
`;

        await this.Hasura.runSQL_Query(sql_statement)
            .then(() => {
                this.config.Logger.Log("Created ${view.name}")
            });
    }
}

module.exports = QikTrakHasura;