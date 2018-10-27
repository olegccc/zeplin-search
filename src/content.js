(function() {

  var searchBox;
  var searchInput;
  var searchStatus;
  var searchItems;
  var buttonRebuild;

  function startSearch() {
    searchBox.className = "search-box";
    searchInput.innerText = '';
    searchStatus.innerText = '';
    onDataReady();
    searchInput.focus();
  }

  let searchTimeout = undefined;

  function onSearchTextChangeBounced() {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(onSearchTextChange, 400);
  }

  function rebuildData() {
    if (!searchProgress) {
      searchProgress = true;
      searchData();
    }
  }

  function onDataReady() {
    if (buttonRebuild) {
      buttonRebuild.onclick = undefined;
    }
    searchStatus.innerHTML = texts ? `
  <div>Search over ${screens.length} screens. You can re-create search database by <button id="search-data-rebuild">clicking here</button> (it can take a while)</div>
  ` : `
  <div>You need to create search database in order to find anything. Please <button id="search-data-rebuild">click here</button> to start.</div>`;
    buttonRebuild = document.getElementById('search-data-rebuild');
    buttonRebuild.onclick = rebuildData;
  }

  function stopSearch() {
    searchBox.className = "search-box hidden";
  }

  let savedData = localStorage.getItem('zeplin_search');
  let searchProgress = false;
  let { projects, screens, texts } = savedData ? JSON.parse(savedData) : {};
  savedData = undefined;

  function saveSearch() {
    localStorage.setItem('zeplin_search', JSON.stringify({
      projects,
      screens,
      texts
    }));
  }

  async function searchData() {
    const headers = {};
    for (const header of Zeplin.headers.keys()) {
      headers[header] = Zeplin.headers.get(header);
    }

    searchStatus.innerText = `Creating search database, please wait.`;
    onSearchTextChange();

    let response = await fetch('https://api.zeplin.io/v2/projects', {
      method: 'GET',
      headers
    });
    const projectsList = (await response.json()).projects.map(({_id, name, thumbnail}) => ({
      id: _id,
      thumbnail,
      name
    }));
    projects = {};
    for (const project of projectsList) {
      projects[project.id] = project;
    }

    screens = [];
    texts = {};

    let projectIndex = 1;

    let updateStatus = function () {
      searchStatus.innerText = `Creating search database, please wait. Receiving project structure ${projectIndex}/${projectsList.length}`;
    };

    screens = [];

    updateStatus();

    function addTextLink(text, screenIndex) {
      if (!text) {
        return;
      }
      text = text.toLowerCase().trim();
      const list = texts[text];
      if (!list) {
        texts[text] = [screenIndex];
      } else {
        if (list.indexOf(screenIndex) < 0) {
          list.push(screenIndex);
        }
      }
    }

    for (const project of Object.values(projects)) {
      const projectId = project.id;
      response = await fetch(`https://api.zeplin.io/v2/projects/${projectId}`, {
        method: 'GET',
        headers
      });
      const data = await response.json();

      for (const screen of data.screens.map(({_id, latestVersion, name, tags}) => ({
        id: _id,
        snapshot: latestVersion.fullSnapshotUrl,
        thumbnail: latestVersion.snapshot.url,
        name,
        tags
      }))) {
        screen.projectId = projectId;
        const screenIndex = screens.length;
        screens.push(screen);

        addTextLink(screen.name, screenIndex);
        for (const tag of screen.tags) {
          addTextLink(tag, screenIndex);
        }
      }
      projectIndex++;
      updateStatus();
    }

    let screenIndex = 0;
    updateStatus = function () {
      searchStatus.innerText = `Creating search database, please wait. Getting screens ${screenIndex + 1}/${screens.length}`;
    };

    updateStatus();

    function scanLayers(screenIndex, layers) {
      for (const layer of layers) {
        if (layer.type === 'text') {
          addTextLink(layer.content, screenIndex);
        }
        if (layer.layers) {
          scanLayers(screenIndex, layer.layers);
        }
      }
    }

    for (const screen of screens) {
      const screenId = screen.id;
      const response = await fetch(screen.snapshot, {
        method: 'GET',
        headers,
      });
      const data = await response.json();

      for (const componentName of data.componentNames || []) {
        addTextLink(componentName, screenIndex);
      }

      scanLayers(screenIndex, data.layers);
      // for (const layer of data.layers) {
      //   if (layer.type === 'text') {
      //     addTextLink(layer.content, screenIndex);
      //   }
      // }

      screenIndex++;
      updateStatus();
      onSearchTextChange();
    }

    onDataReady();
    saveSearch();

    searchProgress = false;
  }

  function onSearchTextChange() {

    searchItems.innerHTML = '';

    if (!projects) {
      rebuildData();
      return;
    }

    const text = searchInput.value.trim().toLowerCase();

    if (!text) {
      return;
    }

    const foundScreensMap = {};

    for (const key of Object.keys(texts)) {
      if (key.indexOf(text) < 0) {
        continue;
      }
      const keyScreens = texts[key];
      for (const screenId of keyScreens) {
        if (!foundScreensMap[screenId]) {
          foundScreensMap[screenId] = [key];
        } else {
          foundScreensMap[screenId].push(key);
        }
      }
    }

    const screenIds = Object.keys(foundScreensMap);
    if (screenIds.length === 0) {
      return;
    }

    let foundScreens = [];

    for (const key of screenIds) {
      foundScreens.push({
        index: Number(key),
        items: foundScreensMap[key]
      });
    }

    foundScreens = foundScreens.sort((a, b) => b.items.length - a.items.length);

    for (let i = 0; ; i++) {
      if (i >= foundScreens.length) {
        break;
      }
      const el = document.createElement('div');
      el.className = 'search-item';
      if (i >= 30) {
        el.innerText = 'More than 30 screens found, search stopped';
        searchItems.appendChild(el);
        break;
      }
      const {index, items} = foundScreens[i] || {};
      const link = document.createElement('a');
      const screen = screens[index];
      const project = projects[screen.projectId];
      link.href = `https://app.zeplin.io/project/${screen.projectId}/screen/${screen.id}`;
      // link.onclick = function(e) {
      //   stopSearch();
      //   window.location.replace(link.href);
      //   //window.location.href = link.href;
      //   return false;
      // };
      link.innerHTML = `
      <div>
        <div class="item-title">${project.name}</div>
        ${project.thumbnail ? `<div class="item-thumbnail"><img src="${project.thumbnail}" width="400"/></div>` : ''}
      </div>
      <div>
        <div>&nbsp;/&nbsp;</div>
      </div>
      <div>
        <div class="item-title">${screen.name}</div>
        ${screen.thumbnail ? `<div class="item-thumbnail"><img src="${screen.thumbnail}" width="400"/></div>` : ''}
      </div>`;
      //link.target = '_new';
      el.appendChild(link);
      const desc = document.createElement('div');
      desc.className = 'search-description';
      const replaceQuery = new RegExp(text, 'g');
      const replaceText = `<span class="highlight">${text}</span>`;
      let added = 0;
      for (const item of items) {
        const el = document.createElement('span');
        if (added > 10) {
          el.innerText = '...more';
          desc.appendChild(el);
          break;
        }
        el.innerText = item;
        el.innerHTML = el.innerHTML.replace(replaceQuery, replaceText);
        desc.appendChild(el);
        added++;
      }
      el.appendChild(desc);
      searchItems.appendChild(el);
    }
  }

  function searchForPlaceholder() {
    let searchPlaceholder = document.getElementById('notificationsButton');
    if (searchPlaceholder) {
      searchPlaceholder = searchPlaceholder.parentElement;
      searchPlaceholder.className += " search-all-parent";
      const p = document.createElement('div');
      document.head.innerHTML += `
<style>
    .search-area {
        cursor: pointer;
        margin-left: 25px;
        margin-top: 7px;
    }
    .search-area svg {
        fill: #aaa;
    }
    .search-box {
        position: absolute;
        top: 60px;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        flex-direction: column;
        z-index: 10000000;
        background: white;
    }
    .search-box .search-header {
        position: absolute;
        top: -60px;
        left: 0;
        right: 0;
        height: 60px;
        background-color: #fff8;
    }
    .search-box.hidden {
        display: none;
    }
    .search-close {
        position: absolute;
        right: 10px;
        top: 34px;
    }
    .search-close button {
        color: cornflowerblue;
    }
    .search-box .search-title {
        margin-top: 1em;
        margin-bottom: 1em;
        font-size: 18pt;
    }
    .search-box > * {
        margin-left: 1em;
        margin-right: 1em;
    }
    .search-body {
        flex: 1 1;
        display: flex;
        flex-direction: column;
    }
    .search-box input {
        font-size: 18pt;
        width: 100%;
        padding-top: 5px;
        padding-bottom: 5px;
        padding-left: 8px;
        flex: none;
    }
    #search-items {
        display: flex;
        flex-direction: column;
        flex: 1 1;
        overflow-y: auto;
    }
    .search-item {
        padding-top: 0.5em;
        padding-bottom: 0.5em;
    }
    .search-item a {
        display: flex;
        flex-direction: row;
        margin-bottom: 10px;
    }
    .search-item a > div {
        display: flex;
        flex-direction: column;
    }
    #search-status {
        margin-top: 0.5em;
        margin-bottom: 0.5em;
        font-size: 11pt;
        color: #777;
        text-align: right;
    }
    #search-status button {
        font-size: 11pt;
        text-decoration: underline;
        color: cornflowerblue;
    }
    .search-item a:visited, .search-item a:hover, .search-item a {
        color: cornflowerblue;
        font-size: 16pt;
    }
    
    .search-item + .search-item {
        border-top: solid 1px deepskyblue;
    }
    .search-item .item-title {
        font-weight: bold;
    }
    .search-item .item-thumbnail {
        padding-top: 10px;
    }
    .search-description > span {
        display: inline-block;
        background: #f6f6f6;
        padding: 5px;
        margin-right: 5px;
        margin-bottom: 5px;
        border-radius: 6px;
        color: #777;
    }
    .search-description > span .highlight {
        color: deeppink;
    }
</style>`;
      p.className = 'search-area';
      p.innerHTML = `
<svg width=\"32\" height=\"32\" viewBox='0 0 16 16'>
<path fill-rule=\"evenodd\" d=\"M2.01 11.715c-2.68-2.68-2.68-7.025 0-9.705 2.68-2.68 7.025-2.68 9.705 0 2.35 2.35 2.64 5.978.87 8.643.034.028.068.06.1.09l2.912 2.913c.536.536.54 1.4 0 1.94-.536.537-1.402.54-1.94 0l-2.913-2.91c-.032-.033-.063-.067-.09-.102-2.666 1.77-6.295 1.48-8.644-.87zm1.94-1.94c1.61 1.607 4.216 1.607 5.824 0 1.608-1.61 1.608-4.216 0-5.824-1.608-1.606-4.215-1.606-5.823 0-1.606 1.61-1.606 4.217 0 5.825z\"></path>
</svg>`;
      p.onclick = startSearch;
      searchPlaceholder.appendChild(p);
      searchBox = document.createElement("div");
      searchBox.className = "search-box hidden";
      document.body.appendChild(searchBox);
      searchBox.innerHTML = `
<div class="search-header" id="search-header"></div>
<div class="search-title">Search Everywhere</div>
<div class="search-close">
    <button id="search-close">CLOSE</button>    
</div>
<div class="search-body">
    <input type="text" id="search-input" placeholder="Search..."/>
    <div id="search-status"></div>
    <div id="search-items"></div>
</div>
    `;
      document.getElementById('search-close').onclick = stopSearch;
      document.getElementById('search-header').onclick = stopSearch;
      searchInput = document.getElementById('search-input');
      searchItems = document.getElementById('search-items');
      searchInput.oninput = onSearchTextChangeBounced;
      searchStatus = document.getElementById('search-status');
      return;
    }
    setTimeout(searchForPlaceholder, 500);
  }

  setTimeout(searchForPlaceholder, 500);

})();
