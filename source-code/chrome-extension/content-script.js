//##############################
// messages to the popup script (popup.js)

// a message to the popup script has one of three forms:
/*
1: {action: `update`, width(number), height(number), fullViewOn(boolean), iframeName(string)}
2: {action: `clear`}
3: {action: `awaitSelection`}
*/

//##############################
// messages from the popup script (popup.js)

// a message from the popup script has one of five forms:
/*
1: {action: `fetch`}
2: {action: `update`, width(number || undefined), height(number || undefined), fullViewOn(boolean || undefined)}
3: {action: `select`, fullViewOn(boolean)}
4: {action: `clear`}
5: {action: `endSelection`}
*/

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === `fetch`) {
    const selectionStyle = document.querySelector(`style[title=iframe-resizer_selection]`);
    // selectionStyle is only present during the selection process
    if (selectionStyle) {
      chrome.runtime.sendMessage({ action: `awaitSelection` });
      return;
    }

    const session = sessionStorage.getItem(`iframeResizerDB`);
    if (session) {
      const { iframeName, width, height, fullViewOn, selection } = JSON.parse(session);
      if (document.querySelectorAll(selection.query)[selection.index]) {
        chrome.runtime.sendMessage({ action: `update`, iframeName, width, height, fullViewOn });
        return;
      }
    }
    
    chrome.runtime.sendMessage({ action: `clear` });
    return;
  }

  if (message.action === `update`) {
    const sessionIframe = fetchIframeFromDB();

    if (sessionIframe) {
      if (message.fullViewOn !== undefined) {
        sessionIframe.fullViewOn = message.fullViewOn;
      }
      if (message.width) {
        sessionIframe.width = message.width;
      }
      if (message.height) {
        sessionIframe.height = message.height;
      }

      sessionStorage.setItem(`iframeResizerDB`, JSON.stringify(sessionIframe));

      refresh();
      return;
    }

    chrome.runtime.sendMessage({ action: `clear` });
    return;
  }

  if (message.action === `select`) {
    listenForSelection({ fullViewOn: message.fullViewOn });
  }

  if (message.action === `clear`) {
    const sessionIframe = fetchIframeFromDB();

    if (sessionIframe) {
      const iframeElement = document.querySelectorAll(sessionIframe.selection.query)[sessionIframe.selection.index];

      restoreOgInlineStyle(iframeElement);
      sessionStorage.removeItem(`iframeResizerDB`);
    }

    chrome.runtime.sendMessage({ action: `clear` });
    return;
  }

  if (message.action === `endSelection`) {
    endSelection();

    chrome.runtime.sendMessage({ action: `clear` });
    return;
  }
});

//##############################
// events

// on page load: when there's an iframe saved, it refreshes by calling the refreshOnLoop helper function.
window.onload = () => {
  const sessionIframe = fetchIframeFromDB();

  if (sessionIframe) {
    refreshOnLoop(0);
  }
}

// on Ctrl+F1: when there's an iframe saved, it toggles the full-view either `on` or `off`. otherwise it inititates a selection to full-view.
document.addEventListener(`keydown`, (event) => {
  if (event.ctrlKey && event.key === `F1`) {
    const sessionIframe = fetchIframeFromDB();

    if (sessionIframe) {
      sessionIframe.fullViewOn = !sessionIframe.fullViewOn;

      sessionStorage.setItem(`iframeResizerDB`, JSON.stringify(sessionIframe));

      const { iframeName, width, height, fullViewOn } = sessionIframe;
      chrome.runtime.sendMessage({ action: `update`, iframeName, width, height, fullViewOn });

      refresh();
      return;
    }

    listenForSelection({ fullViewOn: true });
  }
});

//##############################
// helper functions

// listenForSelection send a `clear` message to the popup script, when the page contains no iframes. It selects; saves; and sends an `update` message, when the page contains only one iframe. And it styles the document for an intuative selection and adds an event listener to get the user's selection, when the page contains more than one iframe. it takes an optional single property(fullViewOn) object:`{fullViewOn(boolean)}` as an argument and returns nothing. it alerts the user in all cases.
function listenForSelection({ fullViewOn = false }) {
  const iframes = document.querySelectorAll(`iframe`);

  if (iframes.length === 0) {
    chrome.runtime.sendMessage({ action: `clear` });
    return window.alert(`This page contains no iframes`);
  }

  // the body's og inline style is stored because it will later be altered to hide the scrollbar when the iframe is in full-view.
  const body = document.querySelector(`body`);
  storeOgInlineStyle(body);

  if (iframes.length === 1) {
    saveIframe(iframes[0], fullViewOn);

    const sessionIframe = fetchIframeFromDB();
    if (sessionIframe) {
      refresh(sessionIframe);

      const { iframeName, width, height, fullViewOn } = sessionIframe;
      chrome.runtime.sendMessage({ action: `update`, iframeName, width, height, fullViewOn });
      return window.alert(`The lonely iframe contained in this page was automatically selected`);
    }

    chrome.runtime.sendMessage({ action: `clear` });
    return window.alert(`The lonely iframe contained in this page could not be selected. Please try again.`);
  }

  const head = document.head || document.querySelector(`head`),
    selectionStyle = document.createElement(`style`);

  selectionStyle.setAttribute(`title`, `iframe-resizer_selection`);
  selectionStyle.innerHTML = `iframe:hover {
    cursor: pointer !important;
  }`;
  head.append(selectionStyle);

  // adds the `click here to select` banner to every iframe in document.
  iframes.forEach(iframe => {
    storeOgInlineStyle(iframe);

    const svgBackground = `%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2021%20161%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%3Cstyle%3E.background%7Bfill%3A%2309c%3B%7D.text%7Bfill%3A%23fff%3B%7D%3C%2Fstyle%3E%3C%2Fdefs%3E%3Ctitle%3Eselect%3C%2Ftitle%3E%3Crect%20class%3D%22background%22%20width%3D%2221%22%20height%3D%22161%22%2F%3E%3Cg%3E%3Cpath%20class%3D%22text%22%20d%3D%22M16.32%2C149.5q-.35-.42-.63-.42a.52.52%2C0%2C0%2C0-.36.12.42.42%2C0%2C0%2C0-.13.35.45.45%2C0%2C0%2C0%2C.19.4%2C2%2C2%2C0%2C0%2C1%2C.39.52%2C3.27%2C3.27%2C0%2C0%2C1%2C.28.67%2C3.79%2C3.79%2C0%2C0%2C1%2C.13%2C1.11%2C3.37%2C3.37%2C0%2C0%2C1-1.85%2C3.09%2C4.11%2C4.11%2C0%2C0%2C1-1.95.45%2C4%2C4%2C0%2C0%2C1-1.91-.46A3.71%2C3.71%2C0%2C0%2C1%2C9.13%2C154a3.44%2C3.44%2C0%2C0%2C1-.5-1.82%2C5.55%2C5.55%2C0%2C0%2C1%2C.08-1%2C2%2C2%2C0%2C0%2C1%2C.21-.68%2C1.08%2C1.08%2C0%2C0%2C1%2C.26-.37%2C2.16%2C2.16%2C0%2C0%2C0%2C.25-.27.56.56%2C0%2C0%2C0%2C.1-.36.43.43%2C0%2C0%2C0-.17-.35.62.62%2C0%2C0%2C0-.35-.12.9.9%2C0%2C0%2C0-.7.44%2C3.29%2C3.29%2C0%2C0%2C0-.52%2C1.16%2C6.5%2C6.5%2C0%2C0%2C0-.19%2C1.58%2C4.39%2C4.39%2C0%2C0%2C0%2C.66%2C2.47%2C4.7%2C4.7%2C0%2C0%2C0%2C1.74%2C1.6%2C5.1%2C5.1%2C0%2C0%2C0%2C2.39.57%2C5.38%2C5.38%2C0%2C0%2C0%2C2.46-.56%2C4.3%2C4.3%2C0%2C0%2C0%2C2.35-4%2C5.25%2C5.25%2C0%2C0%2C0-.26-1.67A3.93%2C3.93%2C0%2C0%2C0%2C16.32%2C149.5Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M16.84%2C146.72a.54.54%2C0%2C0%2C0-.36-.93H4.24a.54.54%2C0%2C0%2C0-.38.15.54.54%2C0%2C0%2C0%2C.38.93H16.46A.54.54%2C0%2C0%2C0%2C16.84%2C146.72Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M16.46%2C142.87a.54.54%2C0%2C0%2C0%2C.38-.15.51.51%2C0%2C0%2C0%2C.16-.39.56.56%2C0%2C0%2C0-.17-.38.55.55%2C0%2C0%2C0-.38-.16H8.2a.54.54%2C0%2C0%2C0-.38.15.48.48%2C0%2C0%2C0-.16.39.47.47%2C0%2C0%2C0%2C.16.38.55.55%2C0%2C0%2C0%2C.38.16Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M5.61%2C141.59a.59.59%2C0%2C0%2C0-.5.19.78.78%2C0%2C0%2C0-.17.53.91.91%2C0%2C0%2C0%2C.17.57.63.63%2C0%2C0%2C0%2C.5.2h.18a.65.65%2C0%2C0%2C0%2C.49-.19.81.81%2C0%2C0%2C0%2C.17-.56.84.84%2C0%2C0%2C0-.17-.55.65.65%2C0%2C0%2C0-.49-.19Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M16.32%2C132.16c-.23-.28-.44-.43-.63-.43a.52.52%2C0%2C0%2C0-.36.12.45.45%2C0%2C0%2C0-.13.35.48.48%2C0%2C0%2C0%2C.19.41%2C1.92%2C1.92%2C0%2C0%2C1%2C.39.51%2C3.36%2C3.36%2C0%2C0%2C1%2C.28.68%2C3.72%2C3.72%2C0%2C0%2C1%2C.13%2C1.1%2C3.38%2C3.38%2C0%2C0%2C1-.5%2C1.86A3.43%2C3.43%2C0%2C0%2C1%2C14.34%2C138a4.11%2C4.11%2C0%2C0%2C1-1.95.45%2C3.86%2C3.86%2C0%2C0%2C1-1.91-.47%2C3.6%2C3.6%2C0%2C0%2C1-1.35-1.28%2C3.44%2C3.44%2C0%2C0%2C1-.5-1.82%2C5.55%2C5.55%2C0%2C0%2C1%2C.08-1%2C2%2C2%2C0%2C0%2C1%2C.21-.67.84.84%2C0%2C0%2C1%2C.26-.38%2C1.54%2C1.54%2C0%2C0%2C0%2C.25-.26.61.61%2C0%2C0%2C0%2C.1-.37.42.42%2C0%2C0%2C0-.17-.34.56.56%2C0%2C0%2C0-.35-.13.9.9%2C0%2C0%2C0-.7.44%2C3.47%2C3.47%2C0%2C0%2C0-.52%2C1.16%2C6.75%2C6.75%2C0%2C0%2C0-.19%2C1.61%2C4.32%2C4.32%2C0%2C0%2C0%2C.66%2C2.39A4.67%2C4.67%2C0%2C0%2C0%2C10%2C139a5%2C5%2C0%2C0%2C0%2C2.39.58%2C5.26%2C5.26%2C0%2C0%2C0%2C2.46-.57A4.28%2C4.28%2C0%2C0%2C0%2C17.2%2C135a5.22%2C5.22%2C0%2C0%2C0-.26-1.71A3.93%2C3.93%2C0%2C0%2C0%2C16.32%2C132.16Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M4.24%2C129.56H16.46A.55.55%2C0%2C0%2C0%2C17%2C129a.52.52%2C0%2C0%2C0-.14-.39.54.54%2C0%2C0%2C0-.38-.15H13.79L12.6%2C127.1l4.2-3.93a.56.56%2C0%2C0%2C0%2C.2-.42.65.65%2C0%2C0%2C0-.13-.38.44.44%2C0%2C0%2C0-.39-.2.67.67%2C0%2C0%2C0-.42.16l-4.17%2C3.94-3.17-3.7a.56.56%2C0%2C0%2C0-.42-.2.58.58%2C0%2C0%2C0-.37.17.48.48%2C0%2C0%2C0-.17.37h0a.45.45%2C0%2C0%2C0%2C.22.36l4.47%2C5.21H4.24a.54.54%2C0%2C0%2C0-.38.15.48.48%2C0%2C0%2C0-.16.39.47.47%2C0%2C0%2C0%2C.16.38A.55.55%2C0%2C0%2C0%2C4.24%2C129.56Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M4.24%2C115.22H16.48a.55.55%2C0%2C0%2C0%2C0-1.1h-5.1a2.31%2C2.31%2C0%2C0%2C1-1.32-.41%2C3.18%2C3.18%2C0%2C0%2C1-.94-1.09%2C3%2C3%2C0%2C0%2C1-.36-1.43%2C2.21%2C2.21%2C0%2C0%2C1%2C.36-1.34%2C2%2C2%2C0%2C0%2C1%2C.94-.72%2C3.5%2C3.5%2C0%2C0%2C1%2C1.32-.23h5.1a.54.54%2C0%2C0%2C0%2C.38-.15.52.52%2C0%2C0%2C0%2C.21-.48.56.56%2C0%2C0%2C0-.59-.52h-5.1a4.76%2C4.76%2C0%2C0%2C0-1.83.34%2C2.85%2C2.85%2C0%2C0%2C0-1.32%2C1%2C3.22%2C3.22%2C0%2C0%2C0-.48%2C1.84A3.27%2C3.27%2C0%2C0%2C0%2C8%2C112.17a4%2C4%2C0%2C0%2C0%2C.66%2C1.19%2C3.72%2C3.72%2C0%2C0%2C0%2C.87.76H4.24a.54.54%2C0%2C0%2C0-.38.15.48.48%2C0%2C0%2C0-.16.39.55.55%2C0%2C0%2C0%2C.54.56Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M15.59%2C97.44a.49.49%2C0%2C0%2C0-.38-.18.48.48%2C0%2C0%2C0-.47.47.59.59%2C0%2C0%2C0%2C.16.38%2C3.76%2C3.76%2C0%2C0%2C1%2C.62.64%2C3.27%2C3.27%2C0%2C0%2C1%2C.48.88%2C3.18%2C3.18%2C0%2C0%2C1%2C.23%2C1.1%2C3.71%2C3.71%2C0%2C0%2C1-.5%2C2%2C3.37%2C3.37%2C0%2C0%2C1-1.37%2C1.25%2C4.29%2C4.29%2C0%2C0%2C1-1.93.43h0V97.57a.54.54%2C0%2C0%2C0-.15-.38.59.59%2C0%2C0%2C0-.37-.18%2C4.86%2C4.86%2C0%2C0%2C0-1.84.39%2C3.9%2C3.9%2C0%2C0%2C0-1.34.93%2C4%2C4%2C0%2C0%2C0-.78%2C1.4%2C4.47%2C4.47%2C0%2C0%2C0-.28%2C1.54%2C3.83%2C3.83%2C0%2C0%2C0%2C.59%2C2%2C4.36%2C4.36%2C0%2C0%2C0%2C1.66%2C1.56%2C5.15%2C5.15%2C0%2C0%2C0%2C2.61.61%2C5%2C5%2C0%2C0%2C0%2C2.49-.6%2C4.16%2C4.16%2C0%2C0%2C0%2C1.6-1.65%2C4.89%2C4.89%2C0%2C0%2C0%2C.6-2.45%2C3.91%2C3.91%2C0%2C0%2C0-.49-1.89A4.91%2C4.91%2C0%2C0%2C0%2C15.59%2C97.44Zm-6%2C5.89a3%2C3%2C0%2C0%2C1-.68-1%2C3.33%2C3.33%2C0%2C0%2C1%2C.93-3.61%2C2.78%2C2.78%2C0%2C0%2C1%2C1.43-.56h.15v6.1a5%2C5%2C0%2C0%2C1-.66-.18A3.61%2C3.61%2C0%2C0%2C1%2C9.58%2C103.33Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M8.7%2C90a.47.47%2C0%2C0%2C0-.15-.35.56.56%2C0%2C0%2C0-.41-.14.44.44%2C0%2C0%2C0-.44.31%2C1.48%2C1.48%2C0%2C0%2C0-.14.62%2C2.83%2C2.83%2C0%2C0%2C0%2C.33%2C1.4%2C3.66%2C3.66%2C0%2C0%2C0%2C.84%2C1.07%2C4%2C4%2C0%2C0%2C0%2C1.15.71l.15.05H8.37A.51.51%2C0%2C0%2C0%2C8%2C93.8a.53.53%2C0%2C0%2C0%2C0%2C.78.49.49%2C0%2C0%2C0%2C.41.16h8.05a.54.54%2C0%2C0%2C0%2C.38-.15.55.55%2C0%2C0%2C0%2C.16-.4.53.53%2C0%2C0%2C0-.18-.39.55.55%2C0%2C0%2C0-.38-.16H12a3.17%2C3.17%2C0%2C0%2C1-1.25-.25%2C4.49%2C4.49%2C0%2C0%2C1-1.12-.65%2C3.75%2C3.75%2C0%2C0%2C1-.81-.92%2C2.07%2C2.07%2C0%2C0%2C1-.29-1%2C1%2C1%2C0%2C0%2C1%2C.09-.49A.86.86%2C0%2C0%2C0%2C8.7%2C90Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M15.59%2C80.74a.49.49%2C0%2C0%2C0-.38-.18.48.48%2C0%2C0%2C0-.47.47.59.59%2C0%2C0%2C0%2C.16.38%2C3.14%2C3.14%2C0%2C0%2C1%2C.62.64%2C3%2C3%2C0%2C0%2C1%2C.48.88A3.25%2C3.25%2C0%2C0%2C1%2C16.23%2C84a3.79%2C3.79%2C0%2C0%2C1-.5%2C2%2C3.44%2C3.44%2C0%2C0%2C1-1.37%2C1.25%2C4.29%2C4.29%2C0%2C0%2C1-1.93.43h0V80.89a.54.54%2C0%2C0%2C0-.15-.38.59.59%2C0%2C0%2C0-.37-.18%2C5%2C5%2C0%2C0%2C0-1.79.42%2C4.17%2C4.17%2C0%2C0%2C0-1.34.94A3.92%2C3.92%2C0%2C0%2C0%2C7.93%2C83a4.47%2C4.47%2C0%2C0%2C0-.28%2C1.54%2C3.83%2C3.83%2C0%2C0%2C0%2C.59%2C2A4.39%2C4.39%2C0%2C0%2C0%2C9.9%2C88.13a5.25%2C5.25%2C0%2C0%2C0%2C2.61.6A5%2C5%2C0%2C0%2C0%2C15%2C88.14a4.19%2C4.19%2C0%2C0%2C0%2C1.6-1.66A4.86%2C4.86%2C0%2C0%2C0%2C17.2%2C84a3.85%2C3.85%2C0%2C0%2C0-.49-1.88A4.78%2C4.78%2C0%2C0%2C0%2C15.59%2C80.74Zm-6%2C5.89a2.74%2C2.74%2C0%2C0%2C1-.68-1%2C3%2C3%2C0%2C0%2C1-.21-1.11A3.13%2C3.13%2C0%2C0%2C1%2C9%2C83.14%2C3.28%2C3.28%2C0%2C0%2C1%2C9.83%2C82a2.75%2C2.75%2C0%2C0%2C1%2C1.43-.56h.15v6.1a5%2C5%2C0%2C0%2C1-.66-.18A3.22%2C3.22%2C0%2C0%2C1%2C9.58%2C86.63Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M8.74%2C69.15A.46.46%2C0%2C0%2C0%2C8.38%2C69h0a.5.5%2C0%2C0%2C0-.5.5v1.82h-2a.53.53%2C0%2C0%2C0-.38.13.48.48%2C0%2C0%2C0-.16.39.56.56%2C0%2C0%2C0%2C.54.58h2V73.7a.47.47%2C0%2C0%2C0%2C.14.37.48.48%2C0%2C0%2C0%2C.36.16.52.52%2C0%2C0%2C0%2C.37-.16.51.51%2C0%2C0%2C0%2C.15-.37V72.43H15a2.65%2C2.65%2C0%2C0%2C0%2C1.24-.24%2C1.28%2C1.28%2C0%2C0%2C0%2C.6-.57%2C1.79%2C1.79%2C0%2C0%2C0%2C.2-.67v-.48a1.29%2C1.29%2C0%2C0%2C0-.17-.69.5.5%2C0%2C0%2C0-.43-.29.47.47%2C0%2C0%2C0-.32.12.37.37%2C0%2C0%2C0-.13.28.57.57%2C0%2C0%2C0%2C0%2C.26.57.57%2C0%2C0%2C1%2C0%2C.26%2C1.06%2C1.06%2C0%2C0%2C1-.08.43.63.63%2C0%2C0%2C1-.33.35%2C1.66%2C1.66%2C0%2C0%2C1-.76.14h-6V69.51A.54.54%2C0%2C0%2C0%2C8.74%2C69.15Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M14.87%2C59.12a5.13%2C5.13%2C0%2C0%2C0-2.46-.59%2C5.17%2C5.17%2C0%2C0%2C0-2.47.59%2C4.58%2C4.58%2C0%2C0%2C0-1.71%2C1.62%2C4.49%2C4.49%2C0%2C0%2C0-.63%2C2.34%2C4.4%2C4.4%2C0%2C0%2C0%2C.63%2C2.32A4.61%2C4.61%2C0%2C0%2C0%2C9.94%2C67a4.87%2C4.87%2C0%2C0%2C0%2C2.47.61A5%2C5%2C0%2C0%2C0%2C14.87%2C67a4.61%2C4.61%2C0%2C0%2C0%2C1.71-1.63%2C4.39%2C4.39%2C0%2C0%2C0%2C.62-2.32%2C4.48%2C4.48%2C0%2C0%2C0-.62-2.34A4.58%2C4.58%2C0%2C0%2C0%2C14.87%2C59.12Zm.82%2C5.77a3.5%2C3.5%2C0%2C0%2C1-1.34%2C1.25%2C4.34%2C4.34%2C0%2C0%2C1-3.89%2C0%2C3.41%2C3.41%2C0%2C0%2C1-1.34-4.81%2C3.34%2C3.34%2C0%2C0%2C1%2C1.34-1.27%2C4.26%2C4.26%2C0%2C0%2C1%2C3.89%2C0%2C3.45%2C3.45%2C0%2C0%2C1%2C1.34%2C1.23A3.4%2C3.4%2C0%2C0%2C1%2C15.69%2C64.89Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M16%2C45.52a2.18%2C2.18%2C0%2C0%2C0-1.37-.44%2C2.23%2C2.23%2C0%2C0%2C0-1.13.25%2C2.1%2C2.1%2C0%2C0%2C0-.75.64%2C3.83%2C3.83%2C0%2C0%2C0-.49.94A8.42%2C8.42%2C0%2C0%2C0%2C11.93%2C48a12.57%2C12.57%2C0%2C0%2C1-.39%2C1.23%2C2.86%2C2.86%2C0%2C0%2C1-.54.88%2C1.28%2C1.28%2C0%2C0%2C1-.86.38%2C1.24%2C1.24%2C0%2C0%2C1-.9-.31%2C1.77%2C1.77%2C0%2C0%2C1-.5-.76%2C2.83%2C2.83%2C0%2C0%2C1-.16-1%2C3.5%2C3.5%2C0%2C0%2C1%2C.24-1.28%2C2.59%2C2.59%2C0%2C0%2C1%2C.73-1%2C.49.49%2C0%2C0%2C0%2C0-.65.53.53%2C0%2C0%2C0-.39-.18.48.48%2C0%2C0%2C0-.36.12%2C2.79%2C2.79%2C0%2C0%2C0-.74.9%2C4.51%2C4.51%2C0%2C0%2C0-.39%2C1%2C4.21%2C4.21%2C0%2C0%2C0-.12%2C1A3.82%2C3.82%2C0%2C0%2C0%2C7.93%2C50a2.6%2C2.6%2C0%2C0%2C0%2C.9%2C1.12%2C2.4%2C2.4%2C0%2C0%2C0%2C2.43.15%2C2.45%2C2.45%2C0%2C0%2C0%2C.76-.71%2C4.13%2C4.13%2C0%2C0%2C0%2C.52-1%2C10.06%2C10.06%2C0%2C0%2C0%2C.37-1.18%2C9.69%2C9.69%2C0%2C0%2C1%2C.34-1.08%2C2.57%2C2.57%2C0%2C0%2C1%2C.54-.84%2C1.29%2C1.29%2C0%2C0%2C1%2C.9-.32%2C1.32%2C1.32%2C0%2C0%2C1%2C.89.32%2C2.09%2C2.09%2C0%2C0%2C1%2C.52.82%2C3.09%2C3.09%2C0%2C0%2C1%2C.17%2C1%2C3.29%2C3.29%2C0%2C0%2C1-.39%2C1.65%2C3.79%2C3.79%2C0%2C0%2C1-1%2C1.18.52.52%2C0%2C0%2C0-.18.35.4.4%2C0%2C0%2C0%2C.1.33.42.42%2C0%2C0%2C0%2C.34.23.71.71%2C0%2C0%2C0%2C.42-.14%2C4%2C4%2C0%2C0%2C0%2C1.26-1.62%2C4.86%2C4.86%2C0%2C0%2C0%2C.38-1.88%2C4.14%2C4.14%2C0%2C0%2C0-.3-1.63A2.85%2C2.85%2C0%2C0%2C0%2C16%2C45.52Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M15.59%2C35.42a.49.49%2C0%2C0%2C0-.38-.18.51.51%2C0%2C0%2C0-.33.13.48.48%2C0%2C0%2C0-.14.34.57.57%2C0%2C0%2C0%2C.16.37%2C3.76%2C3.76%2C0%2C0%2C1%2C.62.64%2C3.07%2C3.07%2C0%2C0%2C1%2C.48.89%2C3.26%2C3.26%2C0%2C0%2C1%2C.19%2C1.07%2C3.7%2C3.7%2C0%2C0%2C1-.5%2C2%2C3.31%2C3.31%2C0%2C0%2C1-1.37%2C1.25%2C4.35%2C4.35%2C0%2C0%2C1-1.91.44V35.56a.54.54%2C0%2C0%2C0-.15-.38.65.65%2C0%2C0%2C0-.37-.18%2C5.27%2C5.27%2C0%2C0%2C0-1.84.39%2C4.06%2C4.06%2C0%2C0%2C0-1.34.94%2C3.9%2C3.9%2C0%2C0%2C0-.78%2C1.37%2C4.47%2C4.47%2C0%2C0%2C0-.28%2C1.54%2C3.83%2C3.83%2C0%2C0%2C0%2C.59%2C2A4.47%2C4.47%2C0%2C0%2C0%2C9.9%2C42.81a5.25%2C5.25%2C0%2C0%2C0%2C2.61.6A5%2C5%2C0%2C0%2C0%2C15%2C42.82a4.19%2C4.19%2C0%2C0%2C0%2C1.6-1.66%2C4.86%2C4.86%2C0%2C0%2C0%2C.6-2.45%2C3.91%2C3.91%2C0%2C0%2C0-.49-1.89A5.24%2C5.24%2C0%2C0%2C0%2C15.59%2C35.42ZM9.54%2C41.33a3%2C3%2C0%2C0%2C1-.68-1%2C3.06%2C3.06%2C0%2C0%2C1%2C1-3.63%2C2.67%2C2.67%2C0%2C0%2C1%2C1.43-.56h.15v6.13a4.26%2C4.26%2C0%2C0%2C1-.7-.19A3.22%2C3.22%2C0%2C0%2C1%2C9.54%2C41.33Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M4.24%2C32.59H16.48a.54.54%2C0%2C0%2C0%2C.38-.15.54.54%2C0%2C0%2C0-.38-.93H4.24a.54.54%2C0%2C0%2C0-.38.15.54.54%2C0%2C0%2C0%2C.38.93Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M15.59%2C21.29a.49.49%2C0%2C0%2C0-.38-.18.51.51%2C0%2C0%2C0-.33.13.48.48%2C0%2C0%2C0-.14.34.57.57%2C0%2C0%2C0%2C.16.37%2C3.76%2C3.76%2C0%2C0%2C1%2C.62.64%2C3.33%2C3.33%2C0%2C0%2C1%2C.48.89%2C3.1%2C3.1%2C0%2C0%2C1%2C.21%2C1.13%2C3.62%2C3.62%2C0%2C0%2C1-.5%2C1.95%2C3.31%2C3.31%2C0%2C0%2C1-1.37%2C1.25%2C4.22%2C4.22%2C0%2C0%2C1-1.88.44V21.47a.54.54%2C0%2C0%2C0-.15-.38.65.65%2C0%2C0%2C0-.37-.18%2C5.27%2C5.27%2C0%2C0%2C0-1.84.39%2C4.06%2C4.06%2C0%2C0%2C0-1.34.94%2C3.92%2C3.92%2C0%2C0%2C0-.83%2C1.33%2C4.47%2C4.47%2C0%2C0%2C0-.28%2C1.54%2C3.83%2C3.83%2C0%2C0%2C0%2C.59%2C2A4.47%2C4.47%2C0%2C0%2C0%2C9.9%2C28.68a5.25%2C5.25%2C0%2C0%2C0%2C2.61.6A5%2C5%2C0%2C0%2C0%2C15%2C28.69%2C4.19%2C4.19%2C0%2C0%2C0%2C16.6%2C27a4.86%2C4.86%2C0%2C0%2C0%2C.6-2.45%2C3.91%2C3.91%2C0%2C0%2C0-.49-1.89A5.24%2C5.24%2C0%2C0%2C0%2C15.59%2C21.29Zm-6%2C5.92a2.87%2C2.87%2C0%2C0%2C1-.68-1%2C3%2C3%2C0%2C0%2C1-.21-1.1%2C3.13%2C3.13%2C0%2C0%2C1%2C1.21-2.5%2C2.67%2C2.67%2C0%2C0%2C1%2C1.43-.56h.15v6.11a4.64%2C4.64%2C0%2C0%2C1-.73-.2A3.22%2C3.22%2C0%2C0%2C1%2C9.56%2C27.21Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M8.91%2C12.81a.92.92%2C0%2C0%2C1%2C.26-.38%2C1.54%2C1.54%2C0%2C0%2C0%2C.25-.26.61.61%2C0%2C0%2C0%2C.1-.37.42.42%2C0%2C0%2C0-.17-.34A.63.63%2C0%2C0%2C0%2C9%2C11.33a.9.9%2C0%2C0%2C0-.69.44%2C3.62%2C3.62%2C0%2C0%2C0-.52%2C1.17%2C6.5%2C6.5%2C0%2C0%2C0-.19%2C1.58%2C4.36%2C4.36%2C0%2C0%2C0%2C.66%2C2.41A4.54%2C4.54%2C0%2C0%2C0%2C10%2C18.53a4.88%2C4.88%2C0%2C0%2C0%2C2.39.63%2C5.26%2C5.26%2C0%2C0%2C0%2C2.46-.57%2C4.28%2C4.28%2C0%2C0%2C0%2C2.35-3.93A5.22%2C5.22%2C0%2C0%2C0%2C16.94%2C13a3.93%2C3.93%2C0%2C0%2C0-.62-1.16q-.35-.42-.63-.42a.52.52%2C0%2C0%2C0-.36.11.45.45%2C0%2C0%2C0-.13.35.48.48%2C0%2C0%2C0%2C.19.41%2C1.92%2C1.92%2C0%2C0%2C1%2C.39.51%2C3.36%2C3.36%2C0%2C0%2C1%2C.28.68%2C3.72%2C3.72%2C0%2C0%2C1%2C.13%2C1.1%2C3.38%2C3.38%2C0%2C0%2C1-1.85%2C3.1%2C4.11%2C4.11%2C0%2C0%2C1-1.95.45%2C3.86%2C3.86%2C0%2C0%2C1-1.91-.47%2C3.6%2C3.6%2C0%2C0%2C1-1.35-1.28%2C3.44%2C3.44%2C0%2C0%2C1-.51-1.85%2C6.74%2C6.74%2C0%2C0%2C1%2C.08-1A2%2C2%2C0%2C0%2C1%2C8.91%2C12.81Z%22%2F%3E%3Cpath%20class%3D%22text%22%20d%3D%22M5.86%2C8.54h2v1.3a.5.5%2C0%2C0%2C0%2C.49.52h0a.51.51%2C0%2C0%2C0%2C.5-.52V8.54H15a2.65%2C2.65%2C0%2C0%2C0%2C1.33-.23%2C1.35%2C1.35%2C0%2C0%2C0%2C.6-.58%2C1.69%2C1.69%2C0%2C0%2C0%2C.2-.66V6.58A1.35%2C1.35%2C0%2C0%2C0%2C17%2C5.9a.5.5%2C0%2C0%2C0-.43-.29.47.47%2C0%2C0%2C0-.32.12.37.37%2C0%2C0%2C0-.13.28.57.57%2C0%2C0%2C0%2C0%2C.26.57.57%2C0%2C0%2C1%2C0%2C.26A1.06%2C1.06%2C0%2C0%2C1%2C16%2C7a.64.64%2C0%2C0%2C1-.35.37%2C1.77%2C1.77%2C0%2C0%2C1-.79.12h-6V5.69h0a.5.5%2C0%2C0%2C0-.5-.5A.51.51%2C0%2C0%2C0%2C8%2C5.33a.43.43%2C0%2C0%2C0-.14.32v1.8h-2a.54.54%2C0%2C0%2C0-.38.15A.48.48%2C0%2C0%2C0%2C5.32%2C8a.55.55%2C0%2C0%2C0%2C.16.39A.55.55%2C0%2C0%2C0%2C5.86%2C8.54Z%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E`;

    iframe.style.setProperty(`padding-left`, `5rem`, `important`);
    iframe.style.setProperty(`background-repeat`, `no-repeat`, `important`);
    iframe.style.setProperty(`background-size`, `5rem 100%`, `important`);
    iframe.style.setProperty(`background-position`, `left`, `important`);
    iframe.style.setProperty(`background-image`, `url("data:image/svg+xml,${svgBackground}")`, `important`);
  });

  body.addEventListener(`click`, selectIframe(fullViewOn), { once: true });
}

// selectIframe selects and saves an iframe preference object to sessionStorage once an iframe is clicked. it also sends an `update` message to the popup script. when on click an iframe is not detected it calls listenForSelection and prompt the user to try again. it takes a boolean as an argument representing whether or not full-view is on and returns an event handler function to be used inside listenForSelection().
function selectIframe(fullViewOn) {
  return (event) => {
    const element = event.target;

    if (element.tagName === `IFRAME`) {
      endSelection();
      saveIframe(element, fullViewOn);

      const sessionIframe = fetchIframeFromDB();
      if (sessionIframe) {
        refresh(sessionIframe);

        const { iframeName, width, height, fullViewOn } = sessionIframe;

        chrome.runtime.sendMessage({ action: `update`, iframeName, width, height, fullViewOn });
        return window.alert(`The iframe was successfully selected`);
      }

      chrome.runtime.sendMessage({ action: `clear` });
      return window.alert(`The selected iframe could not be saved properly. Please try again.`);
    } else {
      endSelection();
      listenForSelection({ fullViewOn });

      return window.alert(`iframe not detected. Please try again.`);
    }
  }
}

// saveIframe saves an object of iframe preferences into sessionStorage (as a JSON). wich can be used to select and style a previously selected iframe. it takes two arguments: an iframe element; and a boolean indicating whether or not full-view is on. it returns nothing.

// the iframe preferences object has the following form
/*
iframeResizerDB = {
  iframeName(string),
  selection: { query(string), index(number) },
  width(number),
  height(number),
  zIndex(number),
  fullViewOn(boolean)
}
*/
function saveIframe(iframeElement, fullViewOn) {
  const iframeHost = new URL(iframeElement.src).host,
    iframeId = iframeElement.getAttribute(`id`),

    sessionIframe = {
      iframeName: iframeElement.name || iframeElement.title || iframeId || iframeHost || `selected iframe`,
      selection: getSelectionQuery(iframeElement),
      width: parseFloat(((parseFloat(window.getComputedStyle(iframeElement).getPropertyValue(`width`)) / visualViewport.width) * 100).toFixed(2)),
      height: parseFloat(((parseFloat(window.getComputedStyle(iframeElement).getPropertyValue(`height`)) / visualViewport.height) * 100).toFixed(2)),
      zIndex: getLargestZIndex(document.querySelectorAll(`*`)) + 1,
      fullViewOn
    };

  sessionStorage.setItem(`iframeResizerDB`, JSON.stringify(sessionIframe));
}

// endSelection removes the event listener (added to select an iframe) from the document. and restores its styles to their original state.
function endSelection() {
  const iframes = document.querySelectorAll(`iframe`);

  document.querySelector(`body`).removeEventListener(`click`, saveIframe, { once: true });

  document.querySelector(`style[title=iframe-resizer_selection]`).remove();

  iframes.forEach(iframe => {
    restoreOgInlineStyle(iframe);
  });
}

// refreshOnLoop calls itself recursively (10 times when passed `0` as an argument) every second until the saved iframe is loaded into the dom; detected; and selected (by calling refresh()). it takes a number as an arguments and returns nothing.
function refreshOnLoop(loopNo) {
  const sessionIframe = fetchIframeFromDB(),
    iframeElement = document.querySelectorAll(sessionIframe.selection.query)[sessionIframe.selection.index];

  if (iframeElement) {
    storeOgInlineStyle(document.querySelector(`body`));
    storeOgInlineStyle(iframeElement);

    refresh();
  } else {
    if (loopNo <= 10) {
      loopNo++;
      setTimeout(refreshOnLoop, 1000, loopNo);
    }
  }
}

// refresh uses an object of iframe preferences (fetched from sessionStorage or passed in as an argument) to style an iframe element previously selected. it takes an optional object of iframe preferences and returns nothing.
function refresh(sessionIframe) {
  if (sessionIframe === undefined) {
    sessionIframe = fetchIframeFromDB();
  }

  if (sessionIframe) {
    const body = document.querySelector(`body`),
      iframeElement = document.querySelectorAll(sessionIframe.selection.query)[sessionIframe.selection.index];

    restoreOgInlineStyle(iframeElement);

    if (sessionIframe.fullViewOn) {
      iframeElement.style.setProperty(`border`, `none`, `important`);
      iframeElement.style.setProperty(`margin`, `0`, `important`);
      iframeElement.style.setProperty(`padding`, `0`)
      iframeElement.style.setProperty(`z-index`, `${sessionIframe.zIndex}`, `important`);
      iframeElement.style.setProperty(`position`, `fixed`, `important`);
      iframeElement.style.setProperty(`top`, `0`, `important`);
      iframeElement.style.setProperty(`left`, `0`, `important`);
      iframeElement.style.setProperty(`width`, `100vw`, `important`);
      iframeElement.style.setProperty(`height`, `100vh`, `important`);

      // it hides the main frame's scrollbar, when the iframe is in full-view
      body.style.setProperty(`overflow`, `hidden`, `important`);

    } else {
      restoreOgInlineStyle(body);

      iframeElement.style.setProperty(`width`, `${sessionIframe.width}vw`, `important`);
      iframeElement.style.setProperty(`height`, `${sessionIframe.height}vh`, `important`);

      iframeElement.scrollIntoView({ behavior: "smooth", block: "center", inline: "start" });
    }
  }
}

// fetchIframeFromDB fetches an object of iframe preferences from sessionStorage. it takes no arguments and returns an object or null.
function fetchIframeFromDB() {
  const session = sessionStorage.getItem(`iframeResizerDB`);

  return session ? JSON.parse(session) : null;
}

// storeOgInlineStyle stores an element's inline style (when present) into a data attribute named:`data-og-style`. it takes an html element as an argument and returns nothing.
function storeOgInlineStyle(element) {
  const ogInlineStyle = element.getAttribute(`style`);
  if (ogInlineStyle) {
    element.setAttribute(`data-og-style`, ogInlineStyle);
  }
}

// restoreOgInlineStyle resets an element's style attribute to it's original state. either by using the `data-og-style` attribute (when present) or by removing its style attribute. it takes an html element as an argument and returns nothing. 
function restoreOgInlineStyle(element) {
  const ogInlineStyle = element.getAttribute(`data-og-style`);
  if (ogInlineStyle) {
    element.setAttribute(`style`, ogInlineStyle);
  } else {
    element.removeAttribute(`style`);
  }
}

// getSelectionQuery takes an iframe element and returns an object:`{query(string), index(number)}` which can be used to uniquely select it using the document's querySelectorAll method, like so:`document.querySelectorAll(query)[index]`. 
function getSelectionQuery(iframeElement) {
  let index = 0;

  const iframeId = iframeElement.getAttribute(`id`),
    iframeClass = iframeElement.getAttribute(`class`),
    query = iframeId ? `iframe[id=${iframeId}]` : null || iframeClass ? `iframe[class=${iframeClass}]` : null || `iframe`,
    iframes = document.querySelectorAll(query);

  if (iframes.length > 1) {
    while (index < iframes.length && iframes[index].src !== iframeElement.src) {
      index++;
    }
  }
  return { query, index };
}

// getLargestZIndex takes an array of html elements and returns the largest z-index value in the array. it can be used to find the largest z-index value in a document by passing it:`document.querySelectorAll('*')` as an argument.
function getLargestZIndex(elementArray) {
  let largestIndex = 0,
    index = 0;

  elementArray.forEach(element => {
    index = parseInt(window.getComputedStyle(element).getPropertyValue(`z-index`));

    if (index > largestIndex) {
      largestIndex = index;
    }
  });

  return largestIndex;
}