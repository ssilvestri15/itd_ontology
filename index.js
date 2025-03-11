require("dotenv").config();
const path = require("path");
const express = require("express");
const app = express();
const port = 3000;
const FUSEKI_URL = "http://localhost:3030/itd/query";

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const LONG_PROMPT = `
Dati gli ingredienti e le loro quantità per una ricetta, e i valori nutrizionali per 100g di ogni ingrediente, restituire i valori nutrizionali totali per **una singola porzione** della ricetta, nel seguente formato JSON:  

{
    "Nome ricetta": {
        "kcal": X,
        "proteine": X,
        "grassi_saturi": X,
        "grassi_insaturi": X,
        "carboidrati": X,
        "fibre": X,
        "zuccheri": X,
        "sale": X
    }
}

**Dati in input:**
REPLACE_ME_WITH_JSON

Restituisci solo il risultato in formato JSON come nell'esempio qui sotto:

{
    "Nome ricetta": {
        "kcal": X,
        "proteine": X,
        "grassi_saturi": X,
        "grassi_insaturi": X,
        "carboidrati": X,
        "fibre": X,
        "zuccheri": X,
        "sale": X
    }
}
`;

const RIELABORA_PROMPT = `
Data questo ricetta modificare la preparzione in modo da adattarla con le seguenti sostituzioni:

REPLACE_ME_WITH_JSON

Restituire una versione rielaborata della stessa. Restiturire la ricetta rielaborata nel seguente formato JSON:
  
{
    "Nome ricetta": {
        "preparazione": "testo rielaborato"
    }
}
`;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const extractJson = (text) => {
  const regex = /\{.*\}/s; // Regex che cattura JSON valido, con il flag 's' per dotall
  const match = text.match(regex);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      return null; // In caso di errore nel parsing del JSON
    }
  }
  return null; // Se non c'è una corrispondenza
};

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
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT ?recipe ?name 
       (GROUP_CONCAT(DISTINCT ?ingredient; separator=", ") AS ?ingredients)
       ?region ?category ?topic ?ingredientText ?preparation
WHERE {
  ?recipe rdf:type ex:Recipe .
  FILTER NOT EXISTS { ?recipe rdf:type dbo:Food }
  
  OPTIONAL {
    ?recipe dbo:name ?name .
    FILTER (lang(?name) = "it")
  }
  OPTIONAL { ?recipe dbo:ingredient ?ingredient . }
  OPTIONAL { ?recipe dbo:region ?region . }
  OPTIONAL { ?recipe dbo:category ?category . }
  OPTIONAL { ?recipe dbo:wikiPageExternalLink ?topic . }
  OPTIONAL { ?recipe ex:hasIngredientText ?ingredientText . }
  OPTIONAL { ?recipe ex:hasPreparation ?preparation . }
}
GROUP BY ?recipe ?name ?region ?category ?topic ?ingredientText ?preparation
    `;
  try {
    const data = await executeSparqlQuery(query);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/recipes/diet", async (req, res) => {
  var type = req.query.type;
  if (!type) {
    return res.status(400).json({ error: "Parametro 'type' mancante" });
  }
  switch (type) {
    case "isVegan":
      type = "VeganRecipe";
      break;
    case "isVegetarian":
      type = "VegetarianRecipe";
      break;
    case "isGlutenFree":
      type = "GlutenFreeRecipe";
      break;
    case "isLactoseFree":
      type = "LactoseFreeRecipe";
      break;
    default:
      return res.status(400).json({ error: "Tipo non valido" });
  }
  const query = `
PREFIX ex: <http://example.org/ontology#>
PREFIX dbo: <http://dbpedia.org/ontology/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?recipe ?name 
       (GROUP_CONCAT(DISTINCT ?ingredient; separator=", ") AS ?ingredients)
       ?region ?category ?topic ?ingredientText ?preparation
WHERE {
  ?recipe a ex:${type} .  # Usa direttamente la classe inferita
  
  OPTIONAL {
    ?recipe dbo:name ?name .
    FILTER (lang(?name) = "it")
  }
  
  OPTIONAL { ?recipe dbo:ingredient ?ingredient . }
  OPTIONAL { ?recipe dbo:region ?region . }
  OPTIONAL { ?recipe dbo:category ?category . }
  OPTIONAL { ?recipe dbo:wikiPageExternalLink ?topic . }
  OPTIONAL { ?recipe ex:hasIngredientText ?ingredientText . }
  OPTIONAL { ?recipe ex:hasPreparation ?preparation . }

}
GROUP BY ?recipe ?name ?region ?category ?topic ?ingredientText ?preparation

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

app.get("/gemini", async (req, res) => {
  const jsonToSend = req.query.jsonToSend;
  const type = req.query.type;
  if (!type) {
    return res.status(400).json({ error: "Parametro 'type' mancante" });
  }
  if (!jsonToSend) {
    return res.status(400).json({ error: "Parametro 'jsonToSend' mancante" });
  }
  const prompt = type === "nutrition" ? LONG_PROMPT : RIELABORA_PROMPT;
  const prompt_final = prompt.replace("REPLACE_ME_WITH_JSON", jsonToSend);
  try {
    const result = await model.generateContent(prompt_final);
    const extracted = extractJson(result.response.text());
    res.json(extracted);
  } catch (error) {
    console.error("Errore nell'esecuzione del modello:", error);
    res.status(500).json({ error: "Errore nel recupero delle alternative" });
  }
});

app.get("/ingredients/calories", async (req, res) => {
  const ingredientName = req.query.name;
  if (!ingredientName) {
    return res.status(400).json({ error: "Nome ingrediente mancante" });
  }

  const query = `
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX dbo: <http://dbpedia.org/ontology/>
    PREFIX ex: <http://example.org/ontology#>

    SELECT ?calories WHERE {
      ?food dbo:name "${ingredientName}"@it .
      ?food dbo:calories ?calories .
    } LIMIT 1
  `;

  try {
    const response = await fetch(
      `${FUSEKI_URL}?query=${encodeURIComponent(query)}&format=json`
    );
    if (!response.ok) {
      throw new Error("Errore nella richiesta a Fuseki");
    }

    const data = await response.json();

    if (data.results.bindings.length > 0) {
      res.json({ calories: data.results.bindings[0].calories.value });
    } else {
      res.json({ calories: "" }); // Nessuna caloria trovata
    }
  } catch (error) {
    console.error("Errore nel recupero delle calorie:", error);
    res.status(500).json({ error: "Errore nel recupero delle calorie" });
  }
});

app.get("/ingredients/nutrition", async (req, res) => {
  const ingredientName = req.query.name;
  if (!ingredientName) {
    return res.status(400).json({ error: "Nome ingrediente mancante" });
  }

  const query = `
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX dbo: <http://dbpedia.org/ontology/>
    PREFIX ex: <http://example.org/ontology#>

    SELECT ?calories ?carbohydrate ?fiber ?salt ?saturatedFat ?sugar ?unsaturatedFat ?proteins WHERE {
      ?food dbo:name "${ingredientName}"@it .
      ?food dbo:calories ?calories .
      ?food dbo:carbohydrate ?carbohydrate .
      ?food dbo:fiber ?fiber .
      ?food dbo:salt ?salt .
      ?food dbo:saturatedFat ?saturatedFat .
      ?food dbo:sugar ?sugar .
      ?food dbo:unsaturatedFat ?unsaturatedFat .
      ?food dbo:proteins ?proteins .
    } LIMIT 1
  `;

  try {
    const response = await fetch(
      `${FUSEKI_URL}?query=${encodeURIComponent(query)}&format=json`
    );
    if (!response.ok) {
      throw new Error("Errore nella richiesta a Fuseki");
    }

    const data = await response.json();

    if (data.results.bindings.length > 0) {
      const result = data.results.bindings[0];
      res.json({
        calories: result.calories.value,
        carbohydrate: result.carbohydrate.value,
        fiber: result.fiber.value,
        salt: result.salt.value,
        saturatedFat: result.saturatedFat.value,
        sugar: result.sugar.value,
        unsaturatedFat: result.unsaturatedFat.value,
        proteins: result.proteins.value,
      });
    } else {
      res.json({ error: "Nessun dato nutrizionale trovato" });
    }
  } catch (error) {
    console.error("Errore nel recupero dei dati nutrizionali:", error);
    res
      .status(500)
      .json({ error: "Errore nel recupero dei dati nutrizionali" });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
