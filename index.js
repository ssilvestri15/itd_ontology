const path = require("path");
const express = require("express");
const app = express();
const port = 3000;
const FUSEKI_URL = "http://localhost:3030/itd/query";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

async function executeSparqlQuery(query) {
  const fetch = (await import("node-fetch")).default;
  const response = await fetch(FUSEKI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/sparql-query",
      Accept: "application/sparql-results+json",
    },
    body: query,
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.statusText}`);
  }

  return await response.json();
}

app.get("/recipes", async (req, res) => {
  const query = `
      PREFIX dbo: <http://dbpedia.org/ontology/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>
      
      SELECT ?recipe ?label 
             (GROUP_CONCAT(DISTINCT ?ingredient; separator=", ") AS ?ingredients)
             ?region ?type ?topic
      WHERE {
        ?recipe a dbo:Recipe .
        OPTIONAL {
          ?recipe rdfs:label ?label .
          FILTER (lang(?label) = "it")
        }
        OPTIONAL { ?recipe dbo:ingredient ?ingredient . }
        OPTIONAL { ?recipe dbo:region ?region . }
        OPTIONAL { ?recipe dbo:type ?type . }
        OPTIONAL { ?recipe foaf:isPrimaryTopicOf ?topic . }
      }
      GROUP BY ?recipe ?label ?region ?type ?topic
    `;
  try {
    const data = await executeSparqlQuery(query);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/alternatives", async (req, res) => {
  const ingredient = req.query.ingredient;

  if (!ingredient) {
    return res.status(400).json({ error: "Parametro 'ingredient' mancante" });
  }

  const query = `
      PREFIX dbo: <http://dbpedia.org/ontology/>
      PREFIX dbr: <http://dbpedia.org/resource/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      SELECT ?type (GROUP_CONCAT(DISTINCT ?alternativeLabel; separator=", ") AS ?alternatives) WHERE {
          dbr:${ingredient} ?type ?alternative .
          FILTER (?type IN (
              dbo:alternative,
              dbo:bindingAlternative,
              dbo:leaveningAlternative,
              dbo:veganAlternative,
              dbo:vegetarianAlternative
          ))
          ?alternative rdfs:label ?alternativeLabel .
          FILTER (lang(?alternativeLabel) = "it")
      }
      GROUP BY ?type
  `;

  try {
    const data = await executeSparqlQuery(query);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Errore nel recupero delle alternative" });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
