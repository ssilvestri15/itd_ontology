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
  document.addEventListener("DOMContentLoaded", () => {
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
    };

    // Funzione helper per estrarre il nome locale da un URI
    const extractLocalName = (uri) => {
      try {
        const url = new URL(uri);
        value = url.pathname.split("/").pop();
        return splitCamelCase(value);
      } catch (e) {
        return uri;
      }
    };

    // Fetch dei dati dal server (endpoint /recipes)
    async function fetchRecipes() {
      try {
        const response = await fetch("/recipes");
        const data = await response.json();
        // Mappatura dei risultati SPARQL in un array di oggetti recipe
        recipes = data.results.bindings.map((item) => ({
          id: extractLocalName(item.recipe.value),
          label: item.label
            ? item.label.value
            : extractLocalName(item.recipe.value),
          region: item.region ? extractLocalName(item.region.value) : "N/D",
          type: item.type ? extractLocalName(item.type.value) : "N/D",
          // La stringa degli ingredienti viene divisa in un array
          ingredients: item.ingredients
            ? item.ingredients.value.split(",").map((i) => i.trim())
            : [],
          topic: item.topic ? item.topic.value : "",
        }));
        populateFilters();
        renderCards();
      } catch (error) {
        console.error("Errore nel recupero delle ricette:", error);
      }
    }

    // Funzione per recuperare le alternative per un dato ingrediente
    async function fetchIngredientAlternatives(ingredient) {
      try {
        cleaned = ingredient.replace("http://dbpedia.org/resource/", "");
        console.log(cleaned);
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

    // Popola i filtri per Regione e Tipo
    function populateFilters() {
      const regionFilter = document.getElementById("regionFilter");
      const typeFilter = document.getElementById("typeFilter");

      regionFilter.innerHTML = '<option value="">Tutte le regioni</option>';
      typeFilter.innerHTML = '<option value="">Tutti i tipi</option>';

      const regions = new Set();
      const types = new Set();

      recipes.forEach((recipe) => {
        if (recipe.region && recipe.region !== "N/D")
          regions.add(recipe.region);
        if (recipe.type && recipe.type !== "N/D") types.add(recipe.type);
      });

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
    }

    // Renderizza le card in base ai filtri oppure mostra il dettaglio se una ricetta è selezionata
    function renderCards() {
      const cardsGrid = document.getElementById("cardsGrid");
      if (selectedRecipe) {
        cardsGrid.innerHTML = "";
        return;
      }
      cardsGrid.innerHTML = "";
      const searchTerm = document
        .getElementById("searchInput")
        .value.toLowerCase();
      const selectedRegion = document.getElementById("regionFilter").value;
      const selectedType = document.getElementById("typeFilter").value;

      const filteredRecipes = recipes.filter((recipe) => {
        return (
          recipe.label.toLowerCase().includes(searchTerm) &&
          (selectedRegion === "" || recipe.region === selectedRegion) &&
          (selectedType === "" || recipe.type === selectedType)
        );
      });

      if (filteredRecipes.length === 0) {
        cardsGrid.innerHTML = `<p style="text-align:center; width:100%; color:#777;">Nessuna ricetta trovata.</p>`;
        return;
      }

      filteredRecipes.forEach((recipe) => {
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
            document.getElementById("recipeDetail").innerHTML =
              'Seleziona una ricetta per vedere i dettagli';
            renderCards();
          } else {
            selectedRecipe = recipe;
            cardsGrid.innerHTML = "";
            displayRecipeDetail(recipe);
          }
        });
        cardsGrid.appendChild(card);
      });
    }

    // Mostra il dettaglio della ricetta selezionata, includendo per ogni ingrediente le alternative (se presenti)
    async function displayRecipeDetail(recipe) {
      const detailContainer = document.getElementById("recipeDetail");
      detailContainer.innerHTML = "";

      const title = document.createElement("h2");
      title.textContent = recipe.label;
      title.classList.add('titillium-web-bold');
      title.classList.add('text-center');
      detailContainer.appendChild(title);

      const info = document.createElement("div");
      info.className = "recipe-info";
      info.innerHTML = `<p><strong>Regione:</strong> ${recipe.region}</p>
                        <p><strong>Tipo:</strong> ${recipe.type}</p>`;
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
        labelSpan.textContent = ing.replace(
          "http://dbpedia.org/resource/",
          ""
        );

        header.appendChild(labelSpan);
        ingCard.appendChild(header);

        // Esegue la query per le alternative per questo ingrediente
        const altData = await fetchIngredientAlternatives(ing);
        if (altData && altData.results.bindings.length > 0) {
          const altContainer = document.createElement("div");
          altContainer.className = "ingredient-alternatives";

          altData.results.bindings.forEach((binding) => {
            const altType = binding.type.value.split("/").pop(); // Es. "alternative", "veganAlternative"
            const altValues = binding.alternatives.value.split(", "); // Divide la stringa di alternative in array

            if (alternativeIcons[altType]) {
              altValues.forEach((altLabel) => {
                const chip = document.createElement("div");
                chip.className = "alternative-chip";
                chip.dataset.ingredientId = ing;
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
        link.classList.add('btn');
        link.classList.add('btn-link');
        link.classList.add('my-2');
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
      backBtn.classList.add('btn');
      backBtn.classList.add('btn-link');
      backBtn.style.marginLeft = "10px";
      backBtn.addEventListener("click", () => {
        selectedRecipe = null;
        document.getElementById("recipeDetail").innerHTML =
          'Seleziona una ricetta per vedere i dettagli';
        renderCards();
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      });
      detailContainer.appendChild(backBtn);
    }

    // Funzione per simulare la rielaborazione della ricetta
    function processRework(recipe) {
      console.log("Processa rielaborazione per:", recipe);
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
          'Seleziona una ricetta per vedere i dettagli';
      }
      renderCards();
    });
    document
      .getElementById("regionFilter")
      .addEventListener("change", () => {
        if (selectedRecipe) {
          selectedRecipe = null;
          document.getElementById("recipeDetail").innerHTML =
            'Seleziona una ricetta per vedere i dettagli';
        }
        renderCards();
      });
    document.getElementById("typeFilter").addEventListener("change", () => {
      if (selectedRecipe) {
        selectedRecipe = null;
        document.getElementById("recipeDetail").innerHTML =
          'Seleziona una ricetta per vedere i dettagli';
      }
      renderCards();
    });

    // Inizializza il caricamento dei dati
    fetchRecipes();
  });