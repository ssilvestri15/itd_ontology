function splitCamelCase(str) {
  // Aggiunge uno spazio prima di ogni lettera maiuscola
  // ma non per la prima lettera della stringa
  const words = str.replace(/([A-Z])/g, " $1").trim(); // Rimuove eventuali spazi extra

  // Capitalizza la prima lettera di ogni parola
  return words
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toCamelCase(str) {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase()) // Replace spaces and non-alphanumeric chars
    .replace(/^./, str[0].toLowerCase()); // Lowercase the first letter
}

document.addEventListener("DOMContentLoaded", () => {
  let recipes_all = []; // Array globale per le ricette
  let recipes = []; // Array globale per le ricette
  let selectedRecipe = null; // Ricetta attualmente selezionata

  /* Mapping dei tipi di alternative a icone e label */
  const alternativeIcons = {
    alternative: { icon: "sync", label: "Alternative" },
    bindingAlternative: { icon: "link", label: "Binding" },
    leaveningAlternative: {
      icon: "emoji_food_beverage",
      label: "Leavening",
    },
    veganAlternative: { icon: "eco", label: "Vegan" },
    vegetarianAlternative: { icon: "spa", label: "Vegetarian" },
    glutenFreeAlternative: { icon: "compost", label: "Gluten" },
  };

  const extractLocalName = (uri) => {
    try {
      const url = new URL(uri);
      // Estrai il frammento dopo il "#"
      const value = url.hash
        ? url.hash.split("#").pop()
        : url.pathname.split("/").pop();
      return splitCamelCase(value); // Funzione che separa le parole nel camelCase
    } catch (e) {
      return uri;
    }
  };

  async function mapRecipe(data) {
    return data.results.bindings.map((item) => ({
      id: extractLocalName(item.recipe.value),
      label: item.name ? item.name.value : extractLocalName(item.recipe.value),
      region: item.region ? extractLocalName(item.region.value) : "N/D",
      type: item.category ? extractLocalName(item.category.value) : "N/D",
      // La stringa degli ingredienti viene divisa in un array
      ingredients: item.ingredients
        ? item.ingredients.value.split(",").map((i) => i.trim())
        : [],
      topic: item.topic ? item.topic.value : "",
      preparation: item.preparation ? item.preparation.value : "",
      ingredientText: item.ingredientText ? item.ingredientText.value : "",
    }));
  }

  async function fetchRecipesByDietFilter(dietType) {
    try {
      const response = await fetch(`/recipes/diet?type=${dietType}`);
      const data = await response.json();
      // Mappatura dei risultati SPARQL in un array di oggetti recipe
      recipes = await mapRecipe(data);
      recipes.sort((a, b) => a.label.localeCompare(b.label));
      populateFilters();
      renderCards();
    } catch (error) {
      console.error("Errore nel recupero delle ricette:", error);
    }
  }

  // Fetch dei dati dal server (endpoint /recipes)
  async function fetchRecipes() {
    try {
      const response = await fetch("/recipes");
      const data = await response.json();
      // Mappatura dei risultati SPARQL in un array di oggetti recipe
      recipes_all = await mapRecipe(data);
      recipes = [...recipes_all];
      recipes.sort((a, b) => a.label.localeCompare(b.label));
      populateFilters();
      renderCards();
    } catch (error) {
      console.error("Errore nel recupero delle ricette:", error);
    }
  }

  // Funzione per recuperare le alternative per un dato ingrediente
  async function fetchIngredientAlternatives(ingredient) {
    try {
      cleaned = extractLocalName(ingredient);
      cleaned = cleaned.replace(/\s+/g, "");
      const response = await fetch(
        `/alternatives?ingredient=${encodeURIComponent(cleaned)}`
      );
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(
        "Errore nel recupero delle alternative per l'ingrediente:",
        ingredient,
        error
      );
      return null;
    }
  }

  async function fetchIngredientCalories(ingredient) {
    try {
        const ingredientName = encodeURIComponent(extractLocalName(ingredient));
        const response = await fetch(`/ingredients/calories?name=${ingredientName}`);

        if (!response.ok) {
            throw new Error(`Errore nella richiesta delle calorie: ${response.status}`);
        }
        
        const data = await response.json();

        // Controllo per evitare errori se il backend non restituisce dati validi
        return data.calories !== undefined ? data.calories : "";

    } catch (error) {
        console.error("Errore nel recupero delle calorie:", error);
        return ""; // Ritorna stringa vuota in caso di errore per non bloccare il rendering
    }
  }

  // Popola i filtri per Regione e Tipo
  function populateFilters() {
    const regionFilter = document.getElementById("regionFilter");
    const typeFilter = document.getElementById("typeFilter");
    const dietFilter = document.getElementById("dietFilter");

    regionFilter.innerHTML = '<option value="">Tutte le regioni</option>';
    typeFilter.innerHTML = '<option value="">Tutti le categorie</option>';
    dietFilter.innerHTML = '<option value="">Tutti le diete</option>';

    var regions = new Set();
    var types = new Set();
    var diets = new Set([
      "Senza Glutine",
      "Senza Lattosio",
      "Vegana",
      "Vegetariana",
    ]);

    recipes.forEach((recipe) => {
      if (recipe.region && recipe.region !== "N/D") regions.add(recipe.region);
      if (recipe.type && recipe.type !== "N/D") types.add(recipe.type);
    });

    regions = new Set([...regions].sort());
    types = new Set([...types].sort());
    diets = new Set([...diets].sort());

    regions.forEach((region) => {
      const opt = document.createElement("option");
      opt.value = region;
      opt.textContent = region;
      regionFilter.appendChild(opt);
    });

    types.forEach((type) => {
      const opt = document.createElement("option");
      opt.value = type;
      opt.textContent = type;
      typeFilter.appendChild(opt);
    });

    diets.forEach((diet) => {
      const opt = document.createElement("option");
      opt.value = diet;
      opt.textContent = diet;
      dietFilter.appendChild(opt);
    });
  }

  let currentPage = 1;
  const recipesPerPage = 20;

function renderCards() {
  const cardsGrid = document.getElementById("cardsGrid");
  const paginationContainer = document.getElementById("pagination");
  const totalRecipesContainer = document.getElementById("totalRecipes");

  if (selectedRecipe) {
      cardsGrid.innerHTML = "";
      paginationContainer.innerHTML = ""; // Nasconde la paginazione se una ricetta è selezionata
      return;
  }

  cardsGrid.innerHTML = "";
  paginationContainer.innerHTML = ""; // Resetta la paginazione

  const searchTerm = document.getElementById("searchInput").value.toLowerCase();
  const selectedRegion = document.getElementById("regionFilter").value;
  const selectedType = document.getElementById("typeFilter").value;

  const filteredRecipes = recipes.filter((recipe) => {
      return (
          recipe.label.toLowerCase().includes(searchTerm) &&
          (selectedRegion === "" || recipe.region === selectedRegion) &&
          (selectedType === "" || recipe.type === selectedType)
      );
  });

  totalRecipesContainer.innerHTML = `<p class="m-0">Ricette trovate: <b>${filteredRecipes.length}</b></p>`;

  if (filteredRecipes.length === 0) {
      cardsGrid.innerHTML = `<p style="text-align:center; width:100%; color:#777;">Nessuna ricetta trovata.</p>`;
      return;
  }

  // Calcola l'indice di partenza e fine per la pagina attuale
  const startIndex = (currentPage - 1) * recipesPerPage;
  const endIndex = startIndex + recipesPerPage;
  const paginatedRecipes = filteredRecipes.slice(startIndex, endIndex);

  // Renderizza le card delle ricette della pagina corrente
  paginatedRecipes.forEach((recipe) => {
      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = recipe.id;
      card.innerHTML = `
          <div class="card-body">
              <h5 class="card-title">${recipe.label}</h5>
              <p class="card-text"><strong>Regione:</strong> ${recipe.region}</p>
              <p class="card-text"><strong>Tipo:</strong> ${recipe.type}</p>
          </div>
      `;
      card.addEventListener("click", () => {
          if (selectedRecipe && selectedRecipe.id === recipe.id) {
              selectedRecipe = null;
              document.getElementById("recipeDetail").innerHTML = "Seleziona una ricetta per vedere i dettagli";
              renderCards();
          } else {
              //selectedRecipe = recipe;
              //cardsGrid.innerHTML = "";
              displayRecipeDetail(recipe);
          }
      });
      cardsGrid.appendChild(card);
    });

    // Genera i pulsanti di paginazione
    renderPagination(filteredRecipes.length);
  }

  function renderPagination(totalRecipes) {
    const paginationContainer = document.getElementById("pagination");
    paginationContainer.innerHTML = ""; // Resetta la paginazione

    const totalPages = Math.ceil(totalRecipes / recipesPerPage);
    if (totalPages <= 1) return; // Se c'è solo una pagina, non mostrare nulla

    const ul = document.createElement("ul");
    ul.className = "pagination justify-content-center align-items-center";

    // Pulsante "Inizio" (<<)
    const firstLi = document.createElement("li");
    firstLi.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
    firstLi.innerHTML = `<a class="page-link" href="#" aria-label="First"><span aria-hidden="true">&laquo;&laquo;</span></a>`;
    firstLi.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentPage > 1) {
            currentPage = 1;
            renderCards();
        }
    });
    ul.appendChild(firstLi);

    // Pulsante "Indietro" (<)
    const prevLi = document.createElement("li");
    prevLi.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
    prevLi.innerHTML = `<a class="page-link" href="#" aria-label="Previous"><span aria-hidden="true">&laquo;</span></a>`;
    prevLi.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentPage > 1) {
            currentPage--;
            renderCards();
        }
    });
    ul.appendChild(prevLi);

    // Indicatore "Pagina X di Y"
    const pageInfoLi = document.createElement("li");
    pageInfoLi.className = "page-item disabled";
    pageInfoLi.innerHTML = `<span class="page-link" style="pointer-events: none;">${currentPage} di ${totalPages}</span>`;
    ul.appendChild(pageInfoLi);

    // Pulsante "Avanti" (>)
    const nextLi = document.createElement("li");
    nextLi.className = `page-item ${currentPage === totalPages ? "disabled" : ""}`;
    nextLi.innerHTML = `<a class="page-link" href="#" aria-label="Next"><span aria-hidden="true">&raquo;</span></a>`;
    nextLi.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentPage < totalPages) {
            currentPage++;
            renderCards();
        }
    });
    ul.appendChild(nextLi);

    // Pulsante "Fine" (>>)
    const lastLi = document.createElement("li");
    lastLi.className = `page-item ${currentPage === totalPages ? "disabled" : ""}`;
    lastLi.innerHTML = `<a class="page-link" href="#" aria-label="Last"><span aria-hidden="true">&raquo;&raquo;</span></a>`;
    lastLi.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentPage < totalPages) {
            currentPage = totalPages;
            renderCards();
        }
    });
    ul.appendChild(lastLi);

    paginationContainer.appendChild(ul);
  }

  function replaceIfStartsWith(originalString, startSubstring, replacement) {
    if (originalString.startsWith(startSubstring)) {
      return replacement + originalString.slice(startSubstring.length);
    }
    return originalString;
  }

  // Mostra il dettaglio della ricetta selezionata, includendo per ogni ingrediente le alternative (se presenti)
  async function displayRecipeDetail(recipe) {
    const detailContainer = document.getElementById("recipeDetail");
    detailContainer.innerHTML = "";

    const title = document.createElement("h2");
    title.textContent = recipe.label;
    title.classList.add("titillium-web-bold");
    title.classList.add("text-center");
    detailContainer.appendChild(title);

    const info = document.createElement("div");
    info.className = "recipe-info";
    info.innerHTML = `<p><strong>Regione:</strong> ${recipe.region}</p>
                        <p><strong>Tipo:</strong> ${recipe.type}</p>
                        <p><strong>Preparazione:</strong> ${
                          recipe.preparation
                        }</p>
                        <p><strong>Ingredienti:</strong> ${replaceIfStartsWith(
                          recipe.ingredientText,
                          "Ingredienti:",
                          ""
                        )}</p>`;
    detailContainer.appendChild(info);

    const ingredientLabel = document.createElement("h3");
    ingredientLabel.textContent = "Ingredienti:";
    ingredientLabel.style.marginBottom = "15px";
    detailContainer.appendChild(ingredientLabel);

    const grid = document.createElement("div");
    grid.className = "ingredient-grid";

    // Per ciascun ingrediente, crea una card e, se disponibili, mostra le alternative
    for (const ing of recipe.ingredients) {
      const ingCard = document.createElement("div");
      ingCard.className = "ingredient-card";

      const header = document.createElement("div");
      header.className = "ingredient-header";
      const labelSpan = document.createElement("span");
      labelSpan.className = "ingredient-label";
      labelSpan.textContent = extractLocalName(ing);

      header.appendChild(labelSpan);
      ingCard.appendChild(header);

      // Esegue la query per ottenere le calorie dell'ingrediente
      const calorieValue = await fetchIngredientCalories(ing);
      if (calorieValue) {  // Controlla se calorieValue non è vuoto
          const calorieInfo = document.createElement("p");
          calorieInfo.className = "ingredient-calories";
          calorieInfo.textContent = `Calorie: ${calorieValue} kcal`;
          ingCard.appendChild(calorieInfo);
      }

      grid.appendChild(ingCard);

      // Esegue la query per le alternative per questo ingrediente
      const altData = await fetchIngredientAlternatives(ing);
      if (altData && altData.results.bindings.length > 0) {
        const altContainer = document.createElement("div");
        altContainer.className = "ingredient-alternatives";

        altData.results.bindings.forEach((binding) => {
          const altType = toCamelCase(extractLocalName(binding.type.value)); // Es. "alternative", "veganAlternative"
          const altValues = binding.alternatives.value.split(", "); // Divide la stringa di alternative in array
          if (alternativeIcons[altType]) {
            altValues.forEach((altLabel) => {
              const chip = document.createElement("div");
              chip.className = "alternative-chip";
              chip.dataset.ingredientId = extractLocalName(ing);
              chip.dataset.alternativeType = altType;
              chip.dataset.alternativeValue = altLabel;

              chip.innerHTML = `
        <span class="material-icons">${alternativeIcons[altType].icon}</span>
        <span>${alternativeIcons[altType].label}: ${altLabel}</span>
      `;

              chip.addEventListener("click", (e) => {
                e.stopPropagation();
                chip.classList.toggle("selected");
              });

              altContainer.appendChild(chip);
            });
          }
        });

        ingCard.appendChild(altContainer);
      }

      grid.appendChild(ingCard);
    }

    detailContainer.appendChild(grid);

    // Se presente, mostra il link alla ricetta completa
    if (recipe.topic) {
      const link = document.createElement("a");
      link.href = recipe.topic;
      link.textContent = "Vai alla ricetta completa";
      link.target = "_blank";
      link.classList.add("btn");
      link.classList.add("btn-link");
      link.classList.add("my-2");
      detailContainer.appendChild(link);
    }

    // Pulsante per simulare la richiesta di rielaborazione
    const reworkBtn = document.createElement("button");
    reworkBtn.id = "reworkButton";
    reworkBtn.textContent = "Rielabora Ricetta";
    reworkBtn.addEventListener("click", () => processRework(recipe));
    detailContainer.appendChild(reworkBtn);

    // Pulsante per tornare alla lista delle ricette
    const backBtn = document.createElement("button");
    backBtn.textContent = "Torna alla lista";
    backBtn.classList.add("btn");
    backBtn.classList.add("btn-link");
    backBtn.style.marginLeft = "10px";
    backBtn.addEventListener("click", () => {
      selectedRecipe = null;
      document.getElementById("recipeDetail").innerHTML =
        "Seleziona una ricetta per vedere i dettagli";
      renderCards();
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });
    detailContainer.appendChild(backBtn);
    
    const myModal = new bootstrap.Modal(document.getElementById('modalRecipe'));
    myModal.show();
  }

  // Funzione per simulare la rielaborazione della ricetta
  function processRework(recipe) {
    const detailContainer = document.getElementById("recipeDetail");
    const resultContainer = document.createElement("div");
    resultContainer.className = "reworked-result";
    resultContainer.textContent = "Rielaborazione in corso...";
    detailContainer.appendChild(resultContainer);

    setTimeout(() => {
      resultContainer.textContent =
        "Ricetta rielaborata:\n" + JSON.stringify(recipe, null, 2);
    }, 1500);
  }

  // Event listeners per i filtri: se il filtro cambia, deseleziona eventualmente la ricetta corrente
  document.getElementById("searchInput").addEventListener("input", () => {
    if (selectedRecipe) {
      selectedRecipe = null;
      document.getElementById("recipeDetail").innerHTML =
        "Seleziona una ricetta per vedere i dettagli";
    }
    renderCards();
  });
  document.getElementById("regionFilter").addEventListener("change", () => {
    if (selectedRecipe) {
      selectedRecipe = null;
      document.getElementById("recipeDetail").innerHTML =
        "Seleziona una ricetta per vedere i dettagli";
    }
    renderCards();
  });
  document.getElementById("typeFilter").addEventListener("change", () => {
    if (selectedRecipe) {
      selectedRecipe = null;
      document.getElementById("recipeDetail").innerHTML =
        "Seleziona una ricetta per vedere i dettagli";
    }
    renderCards();
  });
  document.getElementById("dietFilter").addEventListener("change", function () {
    const selectedValue = this.value;
    if (selectedRecipe) {
      selectedRecipe = null;
      document.getElementById("recipeDetail").innerHTML =
        "Seleziona una ricetta per vedere i dettagli";
    }
    switch (selectedValue) {
      case "Senza Glutine":
        fetchRecipesByDietFilter("isGlutenFree");
        break;
      case "Senza Lattosio":
        fetchRecipesByDietFilter("isLactoseFree");
        break;
      case "Vegana":
        fetchRecipesByDietFilter("isVegan");
        break;
      case "Vegetariana":
        fetchRecipesByDietFilter("isVegetarian");
        break;
      default:
        recipes = [...recipes_all];
        recipes.sort((a, b) => a.label.localeCompare(b.label));
        break;
    }
    renderCards();
  });

  // Inizializza il caricamento dei dati
  fetchRecipes();
});
