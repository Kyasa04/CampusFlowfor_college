
(function () {
  "use strict";

  if (window.__campusFlowLoaded) return;
  window.__campusFlowLoaded = true;

  const ROOT_ID = "cf-root";
  const MENU_ID = "cf-menu-item";
  const API_BASE = "http://localhost:8081";
  const STATE_KEY = "campusflow_open";
  const LOCAL_STORAGE_KEY = "campusflow_complaints";

  const categories = [
    "Classroom Issue",
    "Electrical Issue",
    "Internet / Wi-Fi",
    "Hostel Issue",
    "Cleanliness",
    "Library Issue",
    "Transport Issue",
    "Other"
  ];

  const departments = [
    "Maintenance",
    "IT Support",
    "Hostel Administration",
    "Library",
    "Transport",
    "Academic Administration",
    "Student Services"
  ];

  // ---------------------------------------------------------
  // STATE
  // ---------------------------------------------------------

  function setCampusFlowState(open) {
    try {
      if (open) {
        localStorage.setItem(STATE_KEY, "1");
      } else {
        localStorage.removeItem(STATE_KEY);
      }
    } catch (error) {
      console.warn("Could not save CampusFlow state:", error);
    }
  }

  function shouldRestoreCampusFlow() {
    try {
      return localStorage.getItem(STATE_KEY) === "1";
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------
  // NORMALIZATION
  // IMPORTANT: id is always the official complaint ID.
  // databaseId stores the numeric database ID separately.
  // ---------------------------------------------------------

  function normalizeStatus(status) {
    const value = String(status || "SUBMITTED")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

    if (value === "IN_PROGRESS" || value === "PROCESSING") {
      return "In Progress";
    }

    if (value === "RESOLVED") {
      return "Resolved";
    }

    return "Submitted";
  }

  function normalizeComplaint(item) {
    const officialId = item.complaintId || (
      String(item.id || "").startsWith("CF-") ? item.id : ""
    );

    return {
      ...item,
      id: String(officialId || item.id || ""),
      complaintId: String(officialId || ""),
      databaseId: item.databaseId || (
        item.id && !String(item.id).startsWith("CF-")
          ? item.id
          : ""
      ),
      studentId: item.studentId || "",
      studentName: item.studentName || "",
      category: item.category || "",
      department: item.department || "",
      description: item.description || "",
      image: item.image || item.imageData || "",
      status: normalizeStatus(item.status),
      notificationText: item.notificationText || "",
      createdAt: item.createdAt || "",
      updatedAt: item.updatedAt || ""
    };
  }

  // ---------------------------------------------------------
  // STUDENT IDENTITY
  // ---------------------------------------------------------

  function getERPStudentIdentity() {
    const keys = [
      "studentId",
      "student_id",
      "username",
      "userName",
      "userid",
      "user_id"
    ];

    for (const key of keys) {
      try {
        const value = localStorage.getItem(key);

        if (value && value.trim()) {
          return { id: value.trim(), name: value.trim() };
        }
      } catch (error) {
        console.warn("Could not read ERP identity:", error);
      }
    }

    const selectors = [
      'input[name="username"]',
      'input[name="user_id"]',
      'input[name="studentId"]',
      "[data-student-id]",
      "[data-user-id]"
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) continue;

      const value =
        element.value ||
        element.getAttribute("data-student-id") ||
        element.getAttribute("data-user-id");

      if (value && String(value).trim()) {
        return {
          id: String(value).trim(),
          name: String(value).trim()
        };
      }
    }

    return {
      id: "ERP-STUDENT",
      name: "ERP Student"
    };
  }

  // ---------------------------------------------------------
  // BACKEND API
  // ---------------------------------------------------------

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const responseText = await response.text();

    if (!response.ok) {
      let details = responseText;

      try {
        const parsed = JSON.parse(responseText);
        details =
          parsed.message ||
          parsed.error ||
          parsed.detail ||
          responseText;
      } catch {
        // Keep the original response text.
      }

      throw new Error(
        `Backend returned ${response.status}` +
        (details ? `: ${details}` : "")
      );
    }

    if (response.status === 204 || !responseText) {
      return null;
    }

    try {
      return JSON.parse(responseText);
    } catch {
      throw new Error("The backend returned invalid JSON.");
    }
  }

  // ---------------------------------------------------------
  // CHROME STORAGE
  // ---------------------------------------------------------

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], result => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(result[key] || []);
      });
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve();
      });
    });
  }

  // ---------------------------------------------------------
  // GET COMPLAINTS
  // Do not use local records for backend status updates.
  // ---------------------------------------------------------

  async function getComplaints() {
    try {
      const data = await apiRequest("/api/complaints");

      if (Array.isArray(data)) {
        return data.map(normalizeComplaint);
      }
    } catch (error) {
      console.warn("Backend complaint fetch failed:", error.message);
    }

    const local = await storageGet(LOCAL_STORAGE_KEY);

    return Array.isArray(local)
      ? local.map(normalizeComplaint)
      : [];
  }

  // ---------------------------------------------------------
  // LOGIN CHECK
  // ---------------------------------------------------------

  function isLoggedIn() {
    const url = window.location.href.toLowerCase();

    if (
      url.includes("site%2findexindi") ||
      url.includes("site/indexindi")
    ) {
      return true;
    }

    const password = document.querySelector('input[type="password"]');

    if (password) {
      const style = window.getComputedStyle(password);

      if (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        password.offsetParent !== null
      ) {
        return false;
      }
    }

    return true;
  }

  // ---------------------------------------------------------
  // ERP MENU
  // ---------------------------------------------------------

  function getMainMenu() {
    return (
      document.querySelector("#mainlayout_content > ul") ||
      document.querySelector("#mainlayout_content ul")
    );
  }

  function clearERPActiveItems() {
    const campusItem = document.getElementById(MENU_ID);

    document.querySelectorAll("#mainlayout_content a").forEach(link => {
      if (campusItem && campusItem.contains(link)) return;

      const li = link.closest("li");
      if (!li) return;

      li.classList.remove("active", "selected", "current", "open");
      link.classList.remove("active", "selected", "current");
    });
  }

  function activateCampusFlow() {
    clearERPActiveItems();

    const item = document.getElementById(MENU_ID);
    if (!item) return;

    item.classList.add("active", "selected", "cf-active");

    const link = item.querySelector("a");
    if (link) link.classList.add("active", "selected");
  }

  function createMenuItem() {
    if (!isLoggedIn()) return;
    if (document.getElementById(MENU_ID)) return;

    const links = Array.from(
      document.querySelectorAll("#mainlayout_content a")
    );

    let referenceLink = links.find(
      link => link.textContent.trim().toLowerCase() === "home"
    );

    if (!referenceLink) {
      referenceLink = links.find(
        link => link.textContent.trim().toLowerCase().includes("career choice")
      );
    }

    if (!referenceLink) return;

    const referenceLi = referenceLink.closest("li");
    if (!referenceLi) return;

    const campusItem = referenceLi.cloneNode(true);
    campusItem.id = MENU_ID;

    campusItem.classList.remove(
      "active", "selected", "current", "open", "cf-active"
    );

    campusItem.querySelectorAll("ul, ol").forEach(element => element.remove());

    const campusLink = campusItem.querySelector("a");
    if (!campusLink) return;

    campusLink.removeAttribute("href");
    campusLink.setAttribute("role", "button");
    campusLink.style.cursor = "pointer";
    campusLink.innerHTML = "";

    const icon = document.createElement("span");
    icon.className = "cf-menu-icon";
    icon.textContent = "＋";

    const label = document.createElement("span");
    label.className = "cf-menu-text";
    label.textContent = "CampusFlow";

    campusLink.append(icon, label);

    campusLink.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      setCampusFlowState(true);
      activateCampusFlow();
      openCampusFlow();
    }, true);

    const mainMenu = getMainMenu();
    if (!mainMenu) return;

    const careerLi = Array.from(mainMenu.children).find(li =>
      li.tagName === "LI" &&
      li.textContent.trim().toLowerCase().startsWith("career choice")
    );

    if (careerLi) {
      mainMenu.insertBefore(campusItem, careerLi.nextSibling);
    } else {
      mainMenu.appendChild(campusItem);
    }
  }

  function setupERPMenuClose() {
    if (document.documentElement.dataset.cfMenuCloseReady === "1") return;

    document.documentElement.dataset.cfMenuCloseReady = "1";

    document.addEventListener("click", event => {
      const campusItem = document.getElementById(MENU_ID);

      if (campusItem && campusItem.contains(event.target)) return;

      const clickedLink = event.target.closest?.("#mainlayout_content a");

      if (clickedLink && campusItem) {
        closeCampusFlow(true);
      }
    }, true);
  }

  // ---------------------------------------------------------
  // PANEL POSITION
  // ---------------------------------------------------------

  function alignCampusFlow() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    let left = 316;
    const menu = getMainMenu();

    if (menu) {
      const rect = menu.getBoundingClientRect();

      if (rect.right > 100 && rect.right < 600) {
        left = Math.round(rect.right + 16);
      }
    }

    let top = 43;
    const search = document.querySelector('input[placeholder*="Search"]');

    if (search) {
      const rect = search.getBoundingClientRect();

      if (rect.bottom >= 30 && rect.bottom <= 100) {
        top = Math.round(rect.bottom + 7);
      }
    }

    root.style.setProperty("--cf-left", `${Math.max(left, 280)}px`);
    root.style.setProperty("--cf-top", `${top >= 40 && top <= 90 ? top : 43}px`);
  }

  // ---------------------------------------------------------
  // OPEN PANEL
  // ---------------------------------------------------------

  async function openCampusFlow() {
    closeCampusFlow(false);
    activateCampusFlow();

    const root = document.createElement("div");
    root.id = ROOT_ID;

    root.innerHTML = `
      <div class="cf-page">
        <div class="cf-header">
          <div>
            <h1>CampusFlow / Smart Campus Support</h1>
            <p>Official issue management section</p>
          </div>
        </div>

        <div class="cf-body">
          <div class="cf-stats">
            <div class="cf-stat"><strong id="cf-total">0</strong><span>Total</span></div>
            <div class="cf-stat"><strong id="cf-pending">0</strong><span>Pending</span></div>
            <div class="cf-stat"><strong id="cf-resolved">0</strong><span>Resolved</span></div>
            <div class="cf-stat"><strong id="cf-notifications">0</strong><span>Notifications</span></div>
          </div>

          <div class="cf-actions">
            <button type="button" class="cf-btn primary" id="cf-raise-btn">＋ Raise Official Issue</button>
            <button type="button" class="cf-btn secondary" id="cf-complaints-btn">My Complaints</button>
            <button type="button" class="cf-btn secondary" id="cf-notification-btn">🔔 Notifications</button>
          </div>

          <div id="cf-content"></div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    root.classList.add("cf-open");
    document.body.classList.add("cf-open");
    setCampusFlowState(true);

    alignCampusFlow();
    requestAnimationFrame(alignCampusFlow);
    setTimeout(alignCampusFlow, 300);
    setTimeout(alignCampusFlow, 1000);

    window.addEventListener("resize", alignCampusFlow);

    document.documentElement.classList.remove("cf-restoring-campusflow");

    document.getElementById("cf-raise-btn").addEventListener("click", showRaiseForm);
    document.getElementById("cf-complaints-btn").addEventListener("click", showComplaints);
    document.getElementById("cf-notification-btn").addEventListener("click", showNotifications);

    await updateStats();
    showWelcome();
  }

  // ---------------------------------------------------------
  // CLOSE PANEL
  // ---------------------------------------------------------

  function closeCampusFlow(clearState = true) {
    document.getElementById(ROOT_ID)?.remove();
    document.body?.classList.remove("cf-open");

    const item = document.getElementById(MENU_ID);

    if (item) {
      item.classList.remove("active", "selected", "open", "current", "cf-active");
      item.querySelector("a")?.classList.remove("active", "selected", "current");
    }

    if (clearState) setCampusFlowState(false);

    document.documentElement.classList.remove("cf-restoring-campusflow");
  }

  // ---------------------------------------------------------
  // WELCOME
  // ---------------------------------------------------------

  function showWelcome() {
    const content = document.getElementById("cf-content");
    if (!content) return;

    setActiveButton(null, false);

    content.innerHTML = `
      <div class="cf-welcome">
        <h2>CampusFlow</h2>
        <p>Select an option above to manage your official campus issues.</p>
      </div>
    `;
  }

  // ---------------------------------------------------------
  // RAISE ISSUE FORM
  // ---------------------------------------------------------

  function showRaiseForm() {
    const content = document.getElementById("cf-content");
    if (!content) return;

    setActiveButton("cf-raise-btn", true);

    content.innerHTML = `
      <div class="cf-card">
        <div class="cf-card-title">
          <h2>Raise Official Issue</h2>
          <p>Submit an official campus issue.</p>
        </div>

        <form id="cf-form">
          <div class="cf-grid">
            <div class="cf-field">
              <label for="cf-category">Category</label>
              <select id="cf-category" required>
                <option value="">Select Category</option>
                ${categories.map(value =>
                  `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`
                ).join("")}
              </select>
            </div>

            <div class="cf-field">
              <label for="cf-department">Department</label>
              <select id="cf-department" required>
                <option value="">Select Department</option>
                ${departments.map(value =>
                  `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`
                ).join("")}
              </select>
            </div>
          </div>

          <div class="cf-field">
            <label for="cf-description">Description</label>
            <textarea id="cf-description" rows="6"
              placeholder="Describe the issue..." required></textarea>
          </div>

          <div class="cf-field">
            <label for="cf-image">Image</label>
            <input type="file" id="cf-image" accept="image/*">
          </div>

          <div class="cf-form-buttons">
            <button type="submit" class="cf-btn primary">Submit Official Issue</button>
            <button type="button" class="cf-btn secondary" id="cf-cancel">Cancel</button>
          </div>

          <p id="cf-form-message" role="status"></p>
        </form>
      </div>
    `;

    document.getElementById("cf-form").addEventListener("submit", submitComplaint);
    document.getElementById("cf-cancel").addEventListener("click", showWelcome);
  }

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read the selected image."));
      reader.readAsDataURL(file);
    });
  }

  // ---------------------------------------------------------
  // SUBMIT ISSUE
  // ---------------------------------------------------------

  async function submitComplaint(event) {
    event.preventDefault();

    const category = document.getElementById("cf-category").value;
    const department = document.getElementById("cf-department").value;
    const description = document.getElementById("cf-description").value.trim();
    const imageInput = document.getElementById("cf-image");
    const message = document.getElementById("cf-form-message");
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');

    if (!category || !department || !description) {
      message.textContent = "Please fill in all required fields.";
      return;
    }

    submitButton.disabled = true;
    message.textContent = "Submitting official issue...";

    try {
      const file = imageInput.files?.[0];
      const imageData = file ? await readImage(file) : "";
      const identity = getERPStudentIdentity();

      const payload = {
        studentId: identity.id,
        studentName: identity.name,
        category,
        department,
        description,
        imageName: file ? file.name : "",
        imageData
      };

      const created = await apiRequest("/api/complaints", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (!created || !created.complaintId) {
        throw new Error("The backend did not return an official complaint ID.");
      }

      const complaint = normalizeComplaint(created);
      await updateStats();
      showComplaintDetails(complaint);
    } catch (error) {
      console.error("CampusFlow submission failed:", error);
      message.textContent = `Could not submit to the backend: ${error.message}`;

      alert(
        "The official issue was not confirmed by the backend.\n\n" +
        error.message
      );
    } finally {
      if (submitButton.isConnected) submitButton.disabled = false;
    }
  }

  // ---------------------------------------------------------
  // COMPLAINT DETAILS
  // ---------------------------------------------------------

  function showComplaintDetails(rawComplaint) {
    const complaint = normalizeComplaint(rawComplaint);
    const content = document.getElementById("cf-content");
    if (!content) return;

    if (!complaint.complaintId) {
      console.error("Complaint has no official complaintId:", rawComplaint);
    }

    setActiveButton("cf-complaints-btn", true);

    const status = complaint.status;
    const inProgress = status === "In Progress" || status === "Resolved";
    const resolved = status === "Resolved";

    content.innerHTML = `
      <div class="cf-card">
        <div class="cf-complaint-header">
          <div>
            <strong>${escapeHTML(complaint.complaintId || complaint.id)}</strong>
            <small>${escapeHTML(complaint.category)} • ${escapeHTML(complaint.department)}</small>
          </div>
          <span class="cf-status ${statusClass(status)}">${escapeHTML(status)}</span>
        </div>

        <div class="cf-info-grid">
          <div><b>Category</b><span>${escapeHTML(complaint.category)}</span></div>
          <div><b>Department</b><span>${escapeHTML(complaint.department)}</span></div>
        </div>

        <div>
          <b>Description</b>
          <div class="cf-description">${escapeHTML(complaint.description)}</div>
        </div>

        ${complaint.image ? `
          <img class="cf-complaint-image"
            src="${escapeHTML(complaint.image)}"
            alt="Complaint attachment">
        ` : ""}

        <div class="cf-status-flow">
          <div class="active"><span>1</span> Submitted</div>
          <div class="${inProgress ? "active" : ""}"><span>2</span> In Progress</div>
          <div class="${resolved ? "active" : ""}"><span>3</span> Resolved</div>
        </div>

        <p id="cf-status-message" role="status"></p>

        <div class="cf-status-actions">
          <button type="button" class="cf-status-btn"
            data-status="In Progress"
            ${status === "In Progress" || resolved || !complaint.complaintId ? "disabled" : ""}>
            Mark In Progress
          </button>

          <button type="button" class="cf-status-btn resolved-btn"
            data-status="Resolved"
            ${resolved || !complaint.complaintId ? "disabled" : ""}>
            Mark Resolved
          </button>
        </div>
      </div>
    `;

    content.querySelectorAll(".cf-status-btn").forEach(button => {
      button.addEventListener("click", async () => {
        // Pass the official ID, never the numeric database ID.
        await updateComplaintStatus(
          complaint.complaintId,
          button.dataset.status
        );
      });
    });
  }

  // ---------------------------------------------------------
  // UPDATE ISSUE STATUS
  // Always query the backend and PATCH using CF-YYYY-NNN.
  // ---------------------------------------------------------

  async function updateComplaintStatus(complaintId, newStatus) {
    const buttons = document.querySelectorAll(".cf-status-btn");
    buttons.forEach(button => button.disabled = true);

    const message = document.getElementById("cf-status-message");
    if (message) message.textContent = "Updating status...";

    try {
      const targetId = String(complaintId || "").trim();

      if (!targetId.startsWith("CF-")) {
        throw new Error(
          `Invalid official complaint ID "${targetId}". Expected an ID such as CF-2026-001.`
        );
      }

      // Confirm the official ID exists in the backend.
      const records = await apiRequest("/api/complaints");

      if (!Array.isArray(records)) {
        throw new Error("The backend did not return a valid complaint list.");
      }

      const selected = records.find(item =>
        String(item.complaintId || "").trim() === targetId
      );

      if (!selected) {
        throw new Error(
          `Complaint ${targetId} was not found in the backend. Refresh My Complaints and try again.`
        );
      }

      const backendStatus = String(newStatus)
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

      const updated = await apiRequest(
        `/api/complaints/${encodeURIComponent(selected.complaintId)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: backendStatus })
        }
      );

      if (!updated || !updated.complaintId) {
        throw new Error("The backend did not return the updated complaint.");
      }

      await updateStats();
      showComplaintDetails(normalizeComplaint(updated));

      const successMessage = document.getElementById("cf-status-message");
      if (successMessage) {
        successMessage.textContent = "Status updated successfully.";
      }
    } catch (error) {
      console.error("CampusFlow status update failed:", error);

      const currentMessage = document.getElementById("cf-status-message");
      if (currentMessage) {
        currentMessage.textContent = `Status update failed: ${error.message}`;
      }

      alert("Could not update the official issue status.\n\n" + error.message);

      document.querySelectorAll(".cf-status-btn").forEach(button => {
        button.disabled = false;
      });
    }
  }

  // ---------------------------------------------------------
  // MY COMPLAINTS
  // ---------------------------------------------------------

  async function showComplaints() {
    const content = document.getElementById("cf-content");
    if (!content) return;

    setActiveButton("cf-complaints-btn", true);
    content.innerHTML = `<div class="cf-card"><p>Loading complaints...</p></div>`;

    try {
      // Fetch fresh backend records for the list.
      const records = await apiRequest("/api/complaints");

      if (!Array.isArray(records)) {
        throw new Error("The backend did not return a valid complaint list.");
      }

      const complaints = records.map(normalizeComplaint);

      if (!complaints.length) {
        content.innerHTML = `
          <div class="cf-empty">
            <h2>No Complaints</h2>
            <p>You have not raised any official issues yet.</p>
          </div>
        `;
        return;
      }

      content.innerHTML = `
        <div class="cf-card">
          <div class="cf-card-title">
            <h2>My Complaints</h2>
            <p>Your submitted official issues.</p>
          </div>
          <div class="cf-list">
            ${complaints.map((item, index) => `
              <div class="cf-complaint" data-index="${index}">
                <div class="cf-complaint-header">
                  <div>
                    <strong>${escapeHTML(item.complaintId)}</strong>
                    <small>${escapeHTML(item.category)} • ${escapeHTML(item.department)}</small>
                  </div>
                  <span class="cf-status ${statusClass(item.status)}">${escapeHTML(item.status)}</span>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;

      content.querySelectorAll(".cf-complaint").forEach(element => {
        element.addEventListener("click", () => {
          const selected = complaints[Number(element.dataset.index)];
          if (selected) showComplaintDetails(selected);
        });
      });
    } catch (error) {
      console.error("Could not load complaints:", error);

      content.innerHTML = `
        <div class="cf-empty">
          <h2>Could not load complaints</h2>
          <p>${escapeHTML(error.message)}</p>
        </div>
      `;
    }
  }

  // ---------------------------------------------------------
  // NOTIFICATIONS
  // ---------------------------------------------------------

  async function showNotifications() {
    const content = document.getElementById("cf-content");
    if (!content) return;

    setActiveButton("cf-notification-btn", true);
    content.innerHTML = `<div class="cf-card"><p>Loading notifications...</p></div>`;

    try {
      const records = await apiRequest("/api/complaints");

      if (!Array.isArray(records)) {
        throw new Error("The backend did not return a valid complaint list.");
      }

      const complaints = records.map(normalizeComplaint);

      if (!complaints.length) {
        content.innerHTML = `
          <div class="cf-empty">
            <h2>Notifications</h2>
            <p>No notifications available.</p>
          </div>
        `;
        return;
      }

      content.innerHTML = `
        <div class="cf-card">
          <div class="cf-card-title"><h2>Notifications</h2></div>
          ${complaints.map(complaint => `
            <div class="cf-notification">
              <div>
                <strong>${escapeHTML(complaint.complaintId)}</strong>
                <p>${escapeHTML(
                  complaint.notificationText ||
                  "Official issue submitted successfully."
                )}</p>
                <small>${escapeHTML(complaint.status)}</small>
              </div>
            </div>
          `).join("")}
        </div>
      `;
    } catch (error) {
      content.innerHTML = `
        <div class="cf-empty">
          <h2>Could not load notifications</h2>
          <p>${escapeHTML(error.message)}</p>
        </div>
      `;
    }
  }

  // ---------------------------------------------------------
  // STATISTICS
  // ---------------------------------------------------------

  async function updateStats() {
    let complaints;

    try {
      const records = await apiRequest("/api/complaints");

      if (!Array.isArray(records)) {
        throw new Error("Invalid complaint list.");
      }

      complaints = records.map(normalizeComplaint);
    } catch (error) {
      console.warn("Could not update CampusFlow statistics:", error);
      return;
    }

    const values = {
      "cf-total": complaints.length,
      "cf-pending": complaints.filter(
        item => item.status !== "Resolved"
      ).length,
      "cf-resolved": complaints.filter(
        item => item.status === "Resolved"
      ).length,
      "cf-notifications": complaints.filter(
        item => Boolean(item.notificationText)
      ).length
    };

    for (const [id, value] of Object.entries(values)) {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    }
  }

  // ---------------------------------------------------------
  // BUTTONS AND STATUS STYLES
  // ---------------------------------------------------------

  function setActiveButton(id, active) {
    [
      "cf-raise-btn",
      "cf-complaints-btn",
      "cf-notification-btn"
    ].forEach(buttonId => {
      document.getElementById(buttonId)?.classList.remove("active");
    });

    if (active && id) {
      document.getElementById(id)?.classList.add("active");
    }
  }

  function statusClass(status) {
    if (status === "Resolved") return "resolved";

    if (status === "In Progress" || status === "Processing") {
      return "progress";
    }

    return "submitted";
  }

  // ---------------------------------------------------------
  // HTML ESCAPING
  // ---------------------------------------------------------

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ---------------------------------------------------------
  // RESTORE PANEL AFTER RELOAD
  // ---------------------------------------------------------

  function restoreCampusFlowIfNeeded() {
    if (!shouldRestoreCampusFlow()) return;

    if (!isLoggedIn()) {
      setCampusFlowState(false);
      document.documentElement.classList.remove("cf-restoring-campusflow");
      return;
    }

    if (!document.getElementById(MENU_ID)) return;
    if (document.getElementById(ROOT_ID)) return;

    activateCampusFlow();
    openCampusFlow();
  }

  // ---------------------------------------------------------
  // INITIALIZE
  // ---------------------------------------------------------

  function initialize() {
    if (!isLoggedIn()) {
      closeCampusFlow(true);
      document.getElementById(MENU_ID)?.remove();
      return;
    }

    createMenuItem();
    setupERPMenuClose();
    restoreCampusFlowIfNeeded();
  }

  function startCampusFlow() {
    initialize();

    let timer = null;

    const observer = new MutationObserver(() => {
      clearTimeout(timer);

      timer = setTimeout(() => {
        if (!isLoggedIn()) {
          closeCampusFlow(true);
          document.getElementById(MENU_ID)?.remove();
          return;
        }

        createMenuItem();
        setupERPMenuClose();
        restoreCampusFlowIfNeeded();
      }, 150);
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startCampusFlow, {
      once: true
    });
  } else {
    startCampusFlow();
  }
})();
