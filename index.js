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
PREFIX ex: <http://example.org/ontology#>
PREFIX dbo: <http://dbpedia.org/ontology/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?recipe ?name 
       (GROUP_CONCAT(DISTINCT ?ingredient; separator=", ") AS ?ingredients)
       ?region ?category ?topic
WHERE {
  ?recipe a ex:Recipe .
  
  OPTIONAL {
    ?recipe dbo:name ?name .
    FILTER (lang(?name) = "it")
  }
  OPTIONAL { ?recipe dbo:ingredient ?ingredient . }
  OPTIONAL { ?recipe dbo:region ?region . }
  OPTIONAL { ?recipe dbo:category ?category . }
  OPTIONAL { ?recipe dbo:wikiPageExternalLink ?topic . }
}
GROUP BY ?recipe ?name ?region ?category ?topic

    `;
  try {
    const data = await executeSparqlQuery(query);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/recipes/diet", async (req, res) => {
  const type = req.query.type;
  if (!type) {
    return res.status(400).json({ error: "Parametro 'type' mancante" });
  }
  if (
    type !== "isVegan" &&
    type !== "isVegetarian" &&
    type !== "isGlutenFree" &&
    type !== "isLactoseFree"
  ) {
    return res.status(400).json({ error: "Tipo non valido" });
  }
  const query = `
PREFIX ex: <http://example.org/ontology#>
PREFIX dbo: <http://dbpedia.org/ontology/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?recipe ?name 
       (GROUP_CONCAT(DISTINCT ?ingredient; separator=", ") AS ?ingredients)
       ?region ?category ?link
WHERE {
  ?recipe a ex:Recipe .  # Seleziona tutte le ricette
  
  # Controlla che siano del tipo della dieta scelta in base alla proprietà
  ?recipe ex:${type} "true"^^xsd:boolean .
  
  OPTIONAL {
    ?recipe dbo:name ?name .
    FILTER (lang(?name) = "it")
  }
  
  OPTIONAL { ?recipe dbo:ingredient ?ingredient . }
  OPTIONAL { ?recipe dbo:region ?region . }
  OPTIONAL { ?recipe dbo:category ?category . }
  OPTIONAL { ?recipe dbo:wikiPageExternalLink ?link . }
}
GROUP BY ?recipe ?name ?region ?category ?link

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
      PREFIX ex: <http://example.org/ontology#>
      PREFIX dbo: <http://dbpedia.org/ontology/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      SELECT ?type (GROUP_CONCAT(DISTINCT ?alternativeLabel; separator=", ") AS ?alternatives) WHERE {
          ex:${ingredient} ?type ?alternative .
          FILTER (?type IN (
              ex:alternative,
              ex:bindingAlternative,
              ex:leaveningAlternative,
              ex:veganAlternative,
              ex:vegetarianAlternative,
              ex:glutenFreeAlternative
          ))
          ?alternative dbo:name ?alternativeLabel .
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
