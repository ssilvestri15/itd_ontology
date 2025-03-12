// Funzioni di utilità
const Utils = {
  // Separa le parole in camelCase aggiungendo spazi
  splitCamelCase(str) {
    const words = str.replace(/([A-Z])/g, " $1").trim();
    return words
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  },

  // Converte una stringa in camelCase
  toCamelCase(str) {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
      .replace(/^./, str[0].toLowerCase());
  },

  // Estrae il nome locale da un URI
  extractLocalName(uri) {
    try {
      const url = new URL(uri);
      const value = url.hash
        ? url.hash.split("#").pop()
        : url.pathname.split("/").pop();
      return this.splitCamelCase(value);
    } catch (e) {
      return uri;
    }
  },

  // Rimpiazza la parte iniziale di una stringa
  replaceIfStartsWith(originalString, startSubstring, replacement) {
    if (originalString.startsWith(startSubstring)) {
      return replacement + originalString.slice(startSubstring.length);
    }
    return originalString;
  },
};

// Classe per gestire la cache dei dati
class DataCache {
  constructor() {
    this.cache = new Map();
    this.expireTime = 10 * 60 * 1000; // 10 minuti in millisecondi
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    // Controlla se i dati sono ancora validi
    if (Date.now() - item.timestamp > this.expireTime) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  clear() {
    this.cache.clear();
  }
}

// Classe per le richieste API
class ApiService {
  constructor() {
    this.cache = new DataCache();
  }

  async fetchWithCache(url, cacheKey) {
    // Controlla se i dati sono in cache
    const cachedData = this.cache.get(cacheKey);
    if (cachedData) return cachedData;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Errore nella richiesta: ${response.status}`);
      }
      const data = await response.json();
      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`Errore nella fetch: ${url}`, error);
      throw error;
    }
  }

  async getRecipes() {
    return this.fetchWithCache("/recipes", "all_recipes");
  }

  async getRecipesByDiet(dietType) {
    return this.fetchWithCache(
      `/recipes/diet?type=${dietType}`,
      `diet_${dietType}`
    );
  }

  async getGeminiNutrition(data) {
    return this.fetchWithCache(
      `/gemini?type=nutrition&jsonToSend=${data}`,
      `gemini_nutrition_${data}`
    );
  }

  async getGeminiRework(data) {
    return this.fetchWithCache(
      `/gemini?type=rework&jsonToSend=${data}`,
      `gemini_rework_${data}`
    );
  }

  async getIngredientAlternatives(ingredient) {
    const cleaned = Utils.extractLocalName(ingredient).replace(/\s+/g, "");
    return this.fetchWithCache(
      `/alternatives?ingredient=${encodeURIComponent(cleaned)}`,
      `alternatives_${cleaned}`
    );
  }

  async getIngredientCalories(ingredient) {
    const ingredientName = encodeURIComponent(
      Utils.extractLocalName(ingredient)
    );
    try {
      const data = await this.fetchWithCache(
        `/ingredients/calories?name=${ingredientName}`,
        `calories_${ingredientName}`
      );
      return data.calories !== undefined ? data.calories : "";
    } catch (error) {
      console.error("Errore nel recupero delle calorie:", error);
      return "";
    }
  }

  async getIngredientNutrition(ingredient) {
    const ingredientName = encodeURIComponent(
      Utils.extractLocalName(ingredient)
    );
    try {
      const data = await this.fetchWithCache(
        `/ingredients/nutrition?name=${ingredientName}`,
        `nutrition_${ingredientName}`
      );
      return data !== undefined ? data : {};
    } catch (error) {
      console.error("Errore nel recupero delle calorie:", error);
      return "";
    }
  }
}

// Classe per la gestione dei dati delle ricette
class RecipeManager {
  constructor(apiService) {
    this.apiService = apiService;
    this.allRecipes = [];
    this.filteredRecipes = [];
    this.selectedRecipe = null;
    this.alternativeIcons = {
      alternative: { icon: "sync", label: "Alternative" },
      bindingAlternative: { icon: "link", label: "Binding" },
      leaveningAlternative: { icon: "emoji_food_beverage", label: "Leavening" },
      veganAlternative: { icon: "eco", label: "Vegan" },
      vegetarianAlternative: { icon: "spa", label: "Vegetarian" },
      glutenFreeAlternative: { icon: "compost", label: "Gluten" },
    };
    this.dietTypes = new Map([
      ["Senza Glutine", "isGlutenFree"],
      ["Senza Lattosio", "isLactoseFree"],
      ["Vegana", "isVegan"],
      ["Vegetariana", "isVegetarian"],
    ]);
  }

  async mapRecipe(data) {
    return data.results.bindings.map((item) => ({
      id: Utils.extractLocalName(item.recipe.value),
      label: item.name
        ? item.name.value
        : Utils.extractLocalName(item.recipe.value),
      region: item.region ? Utils.extractLocalName(item.region.value) : "N/D",
      type: item.category ? Utils.extractLocalName(item.category.value) : "N/D",
      ingredients: item.ingredients
        ? item.ingredients.value.split(",").map((i) => i.trim())
        : [],
      topic: item.topic ? item.topic.value : "",
      preparation: item.preparation ? item.preparation.value : "",
      ingredientText: item.ingredientText ? item.ingredientText.value : "",
    }));
  }

  async loadAllRecipes() {
    try {
      const data = await this.apiService.getRecipes();
      this.allRecipes = await this.mapRecipe(data);
      this.allRecipes.sort((a, b) => a.label.localeCompare(b.label));
      this.filteredRecipes = [...this.allRecipes];
    } catch (error) {
      console.error("Errore nel caricamento delle ricette:", error);
      throw error;
    }
  }

  async loadRecipesByDiet(dietType) {
    try {
      const data = await this.apiService.getRecipesByDiet(dietType);
      this.filteredRecipes = await this.mapRecipe(data);
      this.filteredRecipes.sort((a, b) => a.label.localeCompare(b.label));
    } catch (error) {
      console.error(
        `Errore nel caricamento delle ricette per dieta ${dietType}:`,
        error
      );
      throw error;
    }
  }

  resetFilters() {
    this.filteredRecipes = [...this.allRecipes];
  }

  // Restituisce le ricette filtrate in base ai criteri di ricerca
  getFilteredRecipes(searchTerm = "", region = "", type = "") {
    return this.filteredRecipes.filter((recipe) => {
      return (
        recipe.label.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (region === "" || recipe.region === region) &&
        (type === "" || recipe.type === type)
      );
    });
  }

  // Restituisce set unici di regioni e tipi per i filtri
  getFilterOptions() {
    const regions = new Set();
    const types = new Set();

    this.filteredRecipes.forEach((recipe) => {
      if (recipe.region && recipe.region !== "N/D") regions.add(recipe.region);
      if (recipe.type && recipe.type !== "N/D") types.add(recipe.type);
    });

    return {
      regions: [...regions].sort(),
      types: [...types].sort(),
      diets: [...this.dietTypes.keys()].sort(),
    };
  }
}

// Classe UI per la gestione dell'interfaccia utente
class RecipeUI {
  constructor(recipeManager, apiService) {
    this.recipeManager = recipeManager;
    this.apiService = apiService;
    this.currentPage = 1;
    this.recipesPerPage = 20;

    // Elementi DOM
    this.elements = {
      cardsGrid: document.getElementById("cardsGrid"),
      recipeDetail: document.getElementById("recipeDetail"),
      pagination: document.getElementById("pagination"),
      totalRecipes: document.getElementById("totalRecipes"),
      searchInput: document.getElementById("searchInput"),
      regionFilter: document.getElementById("regionFilter"),
      typeFilter: document.getElementById("typeFilter"),
      dietFilter: document.getElementById("dietFilter"),
    };

    // Inizializza gli event listeners
    this.initEventListeners();
  }

  initEventListeners() {
    this.elements.searchInput.addEventListener("input", () =>
      this.handleFilterChange()
    );
    this.elements.regionFilter.addEventListener("change", () =>
      this.handleFilterChange()
    );
    this.elements.typeFilter.addEventListener("change", () =>
      this.handleFilterChange()
    );
    this.elements.dietFilter.addEventListener("change", () =>
      this.handleDietChange()
    );
  }

  handleFilterChange() {
    this.recipeManager.selectedRecipe = null;
    this.elements.recipeDetail.innerHTML =
      "Seleziona una ricetta per vedere i dettagli";
    this.currentPage = 1;
    this.renderCards();
  }

  async handleDietChange() {
    const selectedValue = this.elements.dietFilter.value;
    this.recipeManager.selectedRecipe = null;
    this.elements.recipeDetail.innerHTML =
      "Seleziona una ricetta per vedere i dettagli";
    this.currentPage = 1;

    if (selectedValue === "") {
      this.recipeManager.filteredRecipes = [...this.recipeManager.allRecipes];
    } else {
      const dietType = this.recipeManager.dietTypes.get(selectedValue);
      await this.recipeManager.loadRecipesByDiet(dietType);
    }

    this.populateFilters();
    this.renderCards();
  }

  populateFilters() {
    const { regions, types, diets } = this.recipeManager.getFilterOptions();
    const { regionFilter, typeFilter, dietFilter } = this.elements;
    const currentRegion = regionFilter.value;
    const currentType = typeFilter.value;
    const currentDiet = dietFilter.value;

    // Popola filtro regioni
    regionFilter.innerHTML = '<option value="">Tutte le regioni</option>';
    regions.forEach((region) => {
      const opt = document.createElement("option");
      opt.value = region;
      opt.textContent = region;
      if (region === currentRegion) opt.selected = true;
      regionFilter.appendChild(opt);
    });

    // Popola filtro tipi
    typeFilter.innerHTML = '<option value="">Tutte le categorie</option>';
    types.forEach((type) => {
      const opt = document.createElement("option");
      opt.value = type;
      opt.textContent = type;
      if (type === currentType) opt.selected = true;
      typeFilter.appendChild(opt);
    });

    // Mantieni il valore selezionato per il filtro diete
    dietFilter.innerHTML = '<option value="">Tutte le diete</option>';
    diets.forEach((diet) => {
      const opt = document.createElement("option");
      opt.value = diet;
      opt.textContent = diet;
      if (diet === currentDiet) opt.selected = true;
      dietFilter.appendChild(opt);
    });
  }

  renderCards() {
    const {
      cardsGrid,
      pagination,
      totalRecipes,
      searchInput,
      regionFilter,
      typeFilter,
    } = this.elements;

    if (this.recipeManager.selectedRecipe) {
      cardsGrid.innerHTML = "";
      pagination.innerHTML = "";
      return;
    }

    cardsGrid.innerHTML = "";
    pagination.innerHTML = "";

    const searchTerm = searchInput.value.toLowerCase();
    const selectedRegion = regionFilter.value;
    const selectedType = typeFilter.value;

    const filteredRecipes = this.recipeManager.getFilteredRecipes(
      searchTerm,
      selectedRegion,
      selectedType
    );

    totalRecipes.innerHTML = `<p class="m-0">Ricette trovate: <b>${filteredRecipes.length}</b></p>`;

    if (filteredRecipes.length === 0) {
      cardsGrid.innerHTML = `<p style="text-align:center; width:100%; color:#777;">Nessuna ricetta trovata.</p>`;
      return;
    }

    // Calcola l'indice di partenza e fine per la pagina attuale
    const startIndex = (this.currentPage - 1) * this.recipesPerPage;
    const endIndex = startIndex + this.recipesPerPage;
    const paginatedRecipes = filteredRecipes.slice(startIndex, endIndex);

    // Crea le card delle ricette
    const fragment = document.createDocumentFragment();
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
      card.addEventListener("click", () => this.displayRecipeDetail(recipe));
      fragment.appendChild(card);
    });
    cardsGrid.appendChild(fragment);

    // Genera i pulsanti di paginazione
    this.renderPagination(filteredRecipes.length);
  }

  renderPagination(totalRecipes) {
    const paginationContainer = this.elements.pagination;
    paginationContainer.innerHTML = "";

    const totalPages = Math.ceil(totalRecipes / this.recipesPerPage);
    if (totalPages <= 1) return;

    const ul = document.createElement("ul");
    ul.className = "pagination justify-content-center align-items-center";

    // Pulsante "Inizio" (<<)
    const firstLi = document.createElement("li");
    firstLi.className = `page-item ${this.currentPage === 1 ? "disabled" : ""}`;
    firstLi.innerHTML = `<a class="page-link" href="#" aria-label="First"><span aria-hidden="true">&laquo;&laquo;</span></a>`;
    firstLi.addEventListener("click", (e) => {
      e.preventDefault();
      if (this.currentPage > 1) {
        this.currentPage = 1;
        this.renderCards();
      }
    });
    ul.appendChild(firstLi);

    // Pulsante "Indietro" (<)
    const prevLi = document.createElement("li");
    prevLi.className = `page-item ${this.currentPage === 1 ? "disabled" : ""}`;
    prevLi.innerHTML = `<a class="page-link" href="#" aria-label="Previous"><span aria-hidden="true">&laquo;</span></a>`;
    prevLi.addEventListener("click", (e) => {
      e.preventDefault();
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderCards();
      }
    });
    ul.appendChild(prevLi);

    // Indicatore "Pagina X di Y"
    const pageInfoLi = document.createElement("li");
    pageInfoLi.className = "page-item disabled";
    pageInfoLi.innerHTML = `<span class="page-link" style="pointer-events: none;">${this.currentPage} di ${totalPages}</span>`;
    ul.appendChild(pageInfoLi);

    // Pulsante "Avanti" (>)
    const nextLi = document.createElement("li");
    nextLi.className = `page-item ${
      this.currentPage === totalPages ? "disabled" : ""
    }`;
    nextLi.innerHTML = `<a class="page-link" href="#" aria-label="Next"><span aria-hidden="true">&raquo;</span></a>`;
    nextLi.addEventListener("click", (e) => {
      e.preventDefault();
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.renderCards();
      }
    });
    ul.appendChild(nextLi);

    // Pulsante "Fine" (>>)
    const lastLi = document.createElement("li");
    lastLi.className = `page-item ${
      this.currentPage === totalPages ? "disabled" : ""
    }`;
    lastLi.innerHTML = `<a class="page-link" href="#" aria-label="Last"><span aria-hidden="true">&raquo;&raquo;</span></a>`;
    lastLi.addEventListener("click", (e) => {
      e.preventDefault();
      if (this.currentPage < totalPages) {
        this.currentPage = totalPages;
        this.renderCards();
      }
    });
    ul.appendChild(lastLi);

    paginationContainer.appendChild(ul);
  }

  async displayRecipeDetail(recipe) {
    const mappingIngsValue = new Map();
    const detailContainer = this.elements.recipeDetail;
    detailContainer.innerHTML = `<div class="text-center"><div class="spinner-border" role="status"><span class="visually-hidden">Caricamento...</span></div></div>`;

    const title = document.createElement("h2");
    title.textContent = recipe.label;
    title.classList.add("titillium-web-bold", "text-center");

    const subs = document.createElement("div");
    subs.className = "recipe-info";
    subs.innerHTML = `
      <p><strong>Regione:</strong> ${recipe.region}</p>
      <p><strong>Tipo:</strong> ${recipe.type}</p>
    `;

    const info = document.createElement("div");
    info.className = "recipe-info";
    info.innerHTML = `
      <p><strong>Regione:</strong> ${recipe.region}</p>
      <p><strong>Tipo:</strong> ${recipe.type}</p>
      <p><strong>Preparazione:</strong> ${recipe.preparation}</p>
      <p><strong>Ingredienti:</strong> ${Utils.replaceIfStartsWith(
        recipe.ingredientText,
        "Ingredienti:",
        ""
      )}</p>
    `;

    //Hidden div for gemini nutrition
    const geminiNutrition = document.createElement("div");
    geminiNutrition.className = "gemini-nutrition";
    geminiNutrition.id = "geminiNutrition";
    geminiNutrition.innerHTML = `
              <h3>Valori Nutrizionali per una porzione -- Powered by Google Gemini AI</h3>
              <div class="gemini-loading">
                <div class="gemini-star">
                  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" width="32" height="32" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%; transform: translate3d(0px, 0px, 0px); content-visibility: visible;"><defs><clipPath id="__lottie_element_131"><rect width="32" height="32" x="0" y="0"></rect></clipPath><g id="__lottie_element_138"><g transform="matrix(-1,0,0,-1,16,16)" opacity="1" style="display: block;"><g opacity="1" transform="matrix(1,0,0,1,0,0)"><path fill="url(#__lottie_element_141)" fill-opacity="1" d=" M0.027000000700354576,14 C0.47999998927116394,6.489999771118164 6.489999771118164,0.47999998927116394 14,0.027000000700354576 C14,0.027000000700354576 14,-0.027000000700354576 14,-0.027000000700354576 C6.489999771118164,-0.47999998927116394 0.47999998927116394,-6.489999771118164 0.027000000700354576,-14 C0.027000000700354576,-14 -0.027000000700354576,-14 -0.027000000700354576,-14 C-0.47999998927116394,-6.489999771118164 -6.489999771118164,-0.47999998927116394 -14,-0.027000000700354576 C-14,-0.027000000700354576 -14,0.027000000700354576 -14,0.027000000700354576 C-6.489999771118164,0.47999998927116394 -0.47999998927116394,6.489999771118164 -0.027000000700354576,14 C-0.027000000700354576,14 0.027000000700354576,14 0.027000000700354576,14z"></path></g></g></g><linearGradient id="__lottie_element_141" spreadMethod="pad" gradientUnits="userSpaceOnUse" x1="-9.222999572753906" y1="8.489999771118164" x2="10.461999893188477" y2="-8.211999893188477"><stop offset="0%" stop-color="rgb(33,123,254)"></stop><stop offset="14%" stop-color="rgb(20,133,252)"></stop><stop offset="27%" stop-color="rgb(7,142,251)"></stop><stop offset="52%" stop-color="rgb(84,143,253)"></stop><stop offset="78%" stop-color="rgb(161,144,255)"></stop><stop offset="89%" stop-color="rgb(175,148,254)"></stop><stop offset="100%" stop-color="rgb(189,153,254)"></stop></linearGradient><linearGradient id="__lottie_element_145" spreadMethod="pad" gradientUnits="userSpaceOnUse" x1="-4.002999782562256" y1="4.630000114440918" x2="8.092000007629395" y2="-7.886000156402588"><stop offset="0%" stop-color="rgb(33,123,254)"></stop><stop offset="14%" stop-color="rgb(20,133,252)"></stop><stop offset="27%" stop-color="rgb(7,142,251)"></stop><stop offset="52%" stop-color="rgb(84,143,253)"></stop><stop offset="78%" stop-color="rgb(161,144,255)"></stop><stop offset="89%" stop-color="rgb(175,148,254)"></stop><stop offset="100%" stop-color="rgb(189,153,254)"></stop></linearGradient><mask id="__lottie_element_138_1" mask-type="alpha"><use xlink:href="#__lottie_element_138"></use></mask></defs><g clip-path="url(#__lottie_element_131)"><g mask="url(#__lottie_element_138_1)" style="display: block;"><g transform="matrix(1,0,0,1,16,16)" opacity="1"><g opacity="1" transform="matrix(1,0,0,1,0,0)"><path fill="url(#__lottie_element_145)" fill-opacity="1" d=" M0,-16 C8.830400466918945,-16 16,-8.830400466918945 16,0 C16,8.830400466918945 8.830400466918945,16 0,16 C-8.830400466918945,16 -16,8.830400466918945 -16,0 C-16,-8.830400466918945 -8.830400466918945,-16 0,-16z"></path></g></g></g></g></svg>
                </div>
                <div class="loading-bar bar1"></div>
                <div class="loading-bar bar2"></div>
                <div class="loading-bar bar3"></div>
              </div>
            `;

    const ingredientLabel = document.createElement("h3");
    ingredientLabel.textContent = "Ingredienti:";
    ingredientLabel.style.marginBottom = "15px";

    const grid = document.createElement("div");
    grid.className = "ingredient-grid";

    // Pulizia del contenitore e aggiunta degli elementi principali
    detailContainer.innerHTML = "";
    detailContainer.appendChild(title);
    detailContainer.appendChild(subs);
    detailContainer.appendChild(geminiNutrition);
    detailContainer.appendChild(info);
    detailContainer.appendChild(ingredientLabel);
    const selectedAlternatives = new Map();
    // Promesse per caricare tutti i dati degli ingredienti in parallelo
    const ingredientPromises = recipe.ingredients.map(async (ing) => {
      const ingCard = document.createElement("div");
      ingCard.className = "ingredient-card";

      const header = document.createElement("div");
      header.className = "ingredient-header";
      const labelSpan = document.createElement("span");
      labelSpan.className = "ingredient-label";
      labelSpan.textContent = Utils.extractLocalName(ing);
      header.appendChild(labelSpan);
      ingCard.appendChild(header);

      // Carica calorie in parallelo
      const nutritionPromise = this.apiService
        .getIngredientNutrition(ing)
        .then((values) => {
          if (values) {
            mappingIngsValue.set(Utils.extractLocalName(ing), values);
            const calorieInfo = document.createElement("p");
            calorieInfo.className = "ingredient-calories";
            calorieInfo.textContent = `Calorie: ${values.calories} kcal`;
            ingCard.appendChild(calorieInfo);
            if (mappingIngsValue.size === recipe.ingredients.length) {
              const mapForPrompt = new Map();
              mapForPrompt.set("nome_ricetta", recipe.label);
              mapForPrompt.set(
                "ingredienti_per_ricetta",
                recipe.ingredientText
              );
              mapForPrompt.set(
                "valori_nutrizionali_100g",
                JSON.stringify(Object.fromEntries(mappingIngsValue))
              );
              showGeminiNutrition(mapForPrompt);
            }
          }
        });

      const showGeminiNutrition = async (mapToSend) => {
        try {
          const toSend = JSON.stringify(Object.fromEntries(mapToSend));
          const response = await this.apiService.getGeminiNutrition(toSend);
          const data = response[recipe.label];
          let element = document.getElementById("geminiNutrition");

          // Assuming the response has data in a structure like this:
          // { calories, proteins, saturatedFat, unsaturatedFat, carbohydrates, sugars, fibers }
          element.innerHTML = `
              <h3>Valori Nutrizionali per una porzione -- Powered by Google Gemini AI</h3>
              <div class="gemini-nutrition-grid" id="geminiNutritionGrid">
                <div class="gemini-nutrition-grid-header">
                  <span>Calorie: ${data.kcal}</span><br>
                  <span>Proteine: ${data.proteine}</span><br>
                  <span>Grassi saturi: ${data.grassi_saturi}</span><br>
                  <span>Grassi insaturi: ${data.grassi_insaturi}</span><br>
                  <span>Carboidrati: ${data.carboidrati}</span><br>
                  <span>Zuccheri: ${data.zuccheri}</span><br>
                  <span>Fibre: ${data.fibre}</span><br>
                  <span>Sale: ${data.sale}</span><br>
                </div>
              </div>
            `;
          element.style.display = "block";
        } catch (error) {
          console.error("Error fetching Gemini Nutrition:", error);
        }
      };

      // Carica alternative in parallelo
      const alternativesPromise = this.apiService
        .getIngredientAlternatives(ing)
        .then((altData) => {
          if (altData && altData.results.bindings.length > 0) {
            const altContainer = document.createElement("div");
            altContainer.className = "ingredient-alternatives";

            altData.results.bindings.forEach((binding) => {
              const altType = Utils.toCamelCase(
                Utils.extractLocalName(binding.type.value)
              );
              const altValues = binding.alternatives.value.split(", ");

              if (this.recipeManager.alternativeIcons[altType]) {
                altValues.forEach((altLabel) => {
                  const name = Utils.extractLocalName(ing);
                  const chip = document.createElement("div");
                  chip.className = "alternative-chip";
                  chip.dataset.ingredientId = name;
                  chip.dataset.alternativeType = altType;
                  chip.dataset.alternativeValue = altLabel;

                  chip.innerHTML = `
                  <span class="material-icons">${
                    this.recipeManager.alternativeIcons[altType].icon
                  }</span>
                  <span>${
                    this.recipeManager.alternativeIcons[altType].label
                  }: ${Utils.extractLocalName(altLabel)}</span>
                `;

                  chip.addEventListener("click", (e) => {
                    e.stopPropagation();
                    chip.classList.toggle("selected");
                    //Aggiungi alla array delle alternative selezionate per l'ingrediente
                    if (chip.classList.contains("selected")) {
                      if (!selectedAlternatives.has(name)) {
                        selectedAlternatives.set(name, []);
                      }
                      selectedAlternatives.get(name).push(altLabel);
                    } else {
                      selectedAlternatives
                        .get(name)
                        .splice(
                          selectedAlternatives.get(name).indexOf(altLabel),
                          1
                        );
                      if (selectedAlternatives.get(name).length === 0) {
                        selectedAlternatives.delete(name);
                      }
                    }
                  });

                  altContainer.appendChild(chip);
                });
              }
            });

            ingCard.appendChild(altContainer);
          }
        });

      // Attendi che entrambe le promesse siano risolte
      await Promise.all([nutritionPromise, alternativesPromise]);
      return ingCard;
    });

    // Attendi che tutti gli ingredienti siano pronti
    const ingredientCards = await Promise.all(ingredientPromises);
    ingredientCards.forEach((card) => grid.appendChild(card));
    detailContainer.appendChild(grid);

    // Aggiungi link alla ricetta completa se disponibile
    if (recipe.topic) {
      const link = document.createElement("a");
      link.href = recipe.topic;
      link.textContent = "Vai alla ricetta completa";
      link.target = "_blank";
      link.classList.add("btn", "btn-link", "my-2");
      detailContainer.appendChild(link);
    }

    // Pulsante per simulare la richiesta di rielaborazione
    const reworkBtn = document.createElement("button");
    reworkBtn.id = "reworkButton";
    reworkBtn.textContent = "Rielabora Ricetta";
    reworkBtn.addEventListener("click", () =>
      this.processRework(recipe, selectedAlternatives)
    );
    detailContainer.appendChild(reworkBtn);

    // Pulsante per tornare alla lista delle ricette
    const backBtn = document.createElement("button");
    backBtn.textContent = "Torna alla lista";
    backBtn.classList.add("btn", "btn-link");
    backBtn.style.marginLeft = "10px";
    backBtn.addEventListener("click", () => {
      this.recipeManager.selectedRecipe = null;
      this.elements.recipeDetail.innerHTML =
        "Seleziona una ricetta per vedere i dettagli";
      this.renderCards();
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });
    detailContainer.appendChild(backBtn);

    const myModal = new bootstrap.Modal(document.getElementById("modalRecipe"));
    myModal.show();
  }

  processRework(recipe, selectedAlternatives) {
    const detailContainer = this.elements.recipeDetail;
    const resultContainer = document.createElement("div");
    resultContainer.className = "reworked-result";
    resultContainer.innerHTML = `
    <div class="gemini-loading">
      <div class="gemini-star">
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" width="32" height="32" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%; transform: translate3d(0px, 0px, 0px); content-visibility: visible;"><defs><clipPath id="__lottie_element_131"><rect width="32" height="32" x="0" y="0"></rect></clipPath><g id="__lottie_element_138"><g transform="matrix(-1,0,0,-1,16,16)" opacity="1" style="display: block;"><g opacity="1" transform="matrix(1,0,0,1,0,0)"><path fill="url(#__lottie_element_141)" fill-opacity="1" d=" M0.027000000700354576,14 C0.47999998927116394,6.489999771118164 6.489999771118164,0.47999998927116394 14,0.027000000700354576 C14,0.027000000700354576 14,-0.027000000700354576 14,-0.027000000700354576 C6.489999771118164,-0.47999998927116394 0.47999998927116394,-6.489999771118164 0.027000000700354576,-14 C0.027000000700354576,-14 -0.027000000700354576,-14 -0.027000000700354576,-14 C-0.47999998927116394,-6.489999771118164 -6.489999771118164,-0.47999998927116394 -14,-0.027000000700354576 C-14,-0.027000000700354576 -14,0.027000000700354576 -14,0.027000000700354576 C-6.489999771118164,0.47999998927116394 -0.47999998927116394,6.489999771118164 -0.027000000700354576,14 C-0.027000000700354576,14 0.027000000700354576,14 0.027000000700354576,14z"></path></g></g></g><linearGradient id="__lottie_element_141" spreadMethod="pad" gradientUnits="userSpaceOnUse" x1="-9.222999572753906" y1="8.489999771118164" x2="10.461999893188477" y2="-8.211999893188477"><stop offset="0%" stop-color="rgb(33,123,254)"></stop><stop offset="14%" stop-color="rgb(20,133,252)"></stop><stop offset="27%" stop-color="rgb(7,142,251)"></stop><stop offset="52%" stop-color="rgb(84,143,253)"></stop><stop offset="78%" stop-color="rgb(161,144,255)"></stop><stop offset="89%" stop-color="rgb(175,148,254)"></stop><stop offset="100%" stop-color="rgb(189,153,254)"></stop></linearGradient><linearGradient id="__lottie_element_145" spreadMethod="pad" gradientUnits="userSpaceOnUse" x1="-4.002999782562256" y1="4.630000114440918" x2="8.092000007629395" y2="-7.886000156402588"><stop offset="0%" stop-color="rgb(33,123,254)"></stop><stop offset="14%" stop-color="rgb(20,133,252)"></stop><stop offset="27%" stop-color="rgb(7,142,251)"></stop><stop offset="52%" stop-color="rgb(84,143,253)"></stop><stop offset="78%" stop-color="rgb(161,144,255)"></stop><stop offset="89%" stop-color="rgb(175,148,254)"></stop><stop offset="100%" stop-color="rgb(189,153,254)"></stop></linearGradient><mask id="__lottie_element_138_1" mask-type="alpha"><use xlink:href="#__lottie_element_138"></use></mask></defs><g clip-path="url(#__lottie_element_131)"><g mask="url(#__lottie_element_138_1)" style="display: block;"><g transform="matrix(1,0,0,1,16,16)" opacity="1"><g opacity="1" transform="matrix(1,0,0,1,0,0)"><path fill="url(#__lottie_element_145)" fill-opacity="1" d=" M0,-16 C8.830400466918945,-16 16,-8.830400466918945 16,0 C16,8.830400466918945 8.830400466918945,16 0,16 C-8.830400466918945,16 -16,8.830400466918945 -16,0 C-16,-8.830400466918945 -8.830400466918945,-16 0,-16z"></path></g></g></g></g></svg>
      </div>
      <div class="loading-bar bar1"></div>
      <div class="loading-bar bar2"></div>
      <div class="loading-bar bar3"></div>
    </div>
    `;
    detailContainer.appendChild(resultContainer);
    var text = "";
    selectedAlternatives.forEach((value, key) => {
      text += "Sostituisci " + key + " con " + value.join(", ") + "\n";
    });
    text += "\n\nLa ricetta è: " + recipe.preparation + "\n\n";
    const prompt = encodeURIComponent(text);
    this.apiService.getGeminiRework(prompt).then((data) => {
      if (data.length === 0) {
        resultContainer.textContent = "Nessuna rielaborazione trovata.";
        return;
      }
      const result = data[Object.keys(data)[0]];
      resultContainer.innerHTML = `<p>Ricetta rielaborata: ${result["preparazione"]}</p>`;
    });
  }
}

// Inizializzazione dell'applicazione
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const apiService = new ApiService();
    const recipeManager = new RecipeManager(apiService);
    const ui = new RecipeUI(recipeManager, apiService);

    // Carica tutte le ricette e inizializza l'interfaccia
    await recipeManager.loadAllRecipes();
    ui.populateFilters();
    ui.renderCards();
  } catch (error) {
    console.error(
      "Errore durante l'inizializzazione dell'applicazione:",
      error
    );
    document.getElementById(
      "cardsGrid"
    ).innerHTML = `<div class="alert alert-danger">Si è verificato un errore durante il caricamento dell'applicazione. Riprova più tardi.</div>`;
  }
});
