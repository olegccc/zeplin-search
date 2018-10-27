const request = new XMLHttpRequest();
request.open('GET', chrome.extension.getURL("content.js"), false);
request.send(null);

let script = document.createElement('script');
script.textContent = request.responseText;
(document.head || document.documentElement).prepend(script);
