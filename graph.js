// Make TopicGraph available globally
window.TopicGraph = class TopicGraph {
  constructor(containerId) {
    this.container = document.getElementById(containerId);

    // Create an <svg> inside the container.
    this.svg = d3.select(this.container)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%");

    // We'll place all graph elements within a <g> so we can zoom/pan them together.
    this.graphGroup = this.svg.append("g").attr("class", "graph-group");

    // Add a <defs> section for arrow markers, gradients, etc.
    const defs = this.svg.append("defs");

    // 1) Define an arrow marker
    defs.append("marker")
      .attr("id", "arrow-head")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22) // Adjust depending on node size
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .attr("fill", "var(--text-color)")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5");

    // 2) You could define a radial gradient for the "center" node
    const radialGradient = defs.append("radialGradient")
      .attr("id", "centerNodeGradient")
      .attr("cx", "50%").attr("cy", "50%")
      .attr("r", "50%")
      .attr("fx", "50%").attr("fy", "50%");

    radialGradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#fff"); // Bright center
    radialGradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "var(--button-bg)"); // Outer color

    // We'll store the simulation, nodes, and links here
    this.simulation = null;
    this.nodes = undefined;
    this.links = undefined;

    // Setup a zoom behavior and attach it to the SVG
    this.zoom = d3.zoom()
      .scaleExtent([0.5, 5])   // how far users can zoom out/in
      .on("zoom", (event) => {
        // Apply the zoom & pan transform to our graphGroup
        this.graphGroup.attr("transform", event.transform);
      });

    // Listen for zoom on the svg
    this.svg.call(this.zoom);

    // On window resize, recalculate the svg size and re-render
    window.addEventListener("resize", () => {
      this.updateDimensions();
      if (this.nodes && this.nodes.length > 0) {
        // Re-render with the existing nodes (the first node is the center)
        const center = this.nodes[0].id;
        const linked = this.nodes.filter(n => n.group === 2).map(n => n.id);
        this.renderGraph(center, linked);
      }
    });
  }

  // Dynamically set SVG dimensions to match the container
  updateDimensions() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.svg
      .attr("width", width)
      .attr("height", height);
  }

  // Simplified fetchArticleLinks to only use Wikipedia
  async fetchArticleLinks(topic) {
    try {
      console.log("Attempting to fetch Wikipedia links for:", topic);
      const wikiLinks = await this.fetchWikipediaLinks(topic);
      console.log("Successfully got Wikipedia links:", wikiLinks);
      return wikiLinks;
    } catch (error) {
      console.error("Failed to fetch Wikipedia links:", error);
      // Return mock data instead of throwing error
      return this.getMockLinks(topic);
    }
  }

  // New function to get mock data
  getMockLinks(topic) {
    return [
      `${topic} - Related 1`,
      `${topic} - Related 2`,
      `${topic} - Related 3`,
      `${topic} - Related 4`,
      `${topic} - Related 5`,
      `${topic} - Related 6`,
      `${topic} - Related 7`,
      `${topic} - Related 8`,
    ];
  }

  async fetchWikipediaLinks(topic) {
    const apiUrl = "https://en.wikipedia.org/w/api.php";
    const urlParams = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      generator: "search",
      gsrsearch: topic,
      gsrlimit: "8",
      prop: "pageimages|extracts",
      exintro: "1",
      explaintext: "1"
    });

    const response = await fetch(`${apiUrl}?${urlParams.toString()}`);
    if (!response.ok) throw new Error('Wikipedia API request failed');
    const data = await response.json();
    
    if (!data.query || !data.query.pages) {
      throw new Error('No results found');
    }

    return Object.values(data.query.pages)
      .sort((a, b) => a.index - b.index)
      .map(page => page.title);
  }

  // Modify the renderGraph method to update articles for all visible nodes
  async renderGraph(centerTopic, linkedTopics) {
    // Update the SVG's size
    this.updateDimensions();

    // Update articles for all topics that will be shown
    const allTopics = [centerTopic, ...linkedTopics];
    await this.updateArticles(allTopics);

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // Adapt node size / fonts to smaller screens
    const isSmallScreen = width < 768;
    const isTinyScreen = width < 480;
    const centerNodeSize = isTinyScreen ? 15 : (isSmallScreen ? 25 : 35);
    const otherNodeSize = isTinyScreen ? 12 : (isSmallScreen ? 20 : 28);
    const fontSize = isTinyScreen ? "12px" : (isSmallScreen ? "14px" : "16px");

    // If we have no nodes or the center topic changed, re-init
    if (!this.nodes || this.nodes[0].id !== centerTopic) {
      this.nodes = [{ id: centerTopic, group: 1 }];
      this.links = [];
      linkedTopics.forEach(topic => {
        if (!this.nodes.find(n => n.id === topic)) {
          this.nodes.push({
            id: topic,
            group: 2,
            // start near the center node
            x: width / 2 + (Math.random() - 0.5) * 200,
            y: height / 2 + (Math.random() - 0.5) * 200
          });
          this.links.push({ source: centerTopic, target: topic });
        }
      });
    } else {
      // If re-rendering (like on window resize), just ensure new linked topics are present
      linkedTopics.forEach(topic => {
        if (!this.nodes.find(n => n.id === topic)) {
          this.nodes.push({
            id: topic,
            group: 2,
            x: this.nodes[0].x + (Math.random() - 0.5) * 200,
            y: this.nodes[0].y + (Math.random() - 0.5) * 200
          });
          this.links.push({ source: centerTopic, target: topic });
        }
      });
    }

    // Stop an old simulation if it exists
    if (this.simulation) {
      this.simulation.stop();
    }

    // Clear out anything from the previous draw
    this.graphGroup.selectAll("*").remove();

    // Create our link and node groups inside graphGroup
    const linkGroup = this.graphGroup.append("g").attr("class", "links");
    const nodeGroup = this.graphGroup.append("g").attr("class", "nodes");
    const labelGroup = this.graphGroup.append("g").attr("class", "labels");

    // We can define a color scale for all "other" nodes
    // so each node has a different color
    const colorScale = d3.scaleOrdinal(d3.schemeSet2);

    // Modify the simulation forces
    this.simulation = d3.forceSimulation(this.nodes)
      .force("link", d3.forceLink(this.links)
        .id(d => d.id)
        .distance(isTinyScreen ? 30 : (isSmallScreen ? 50 : 100)))
      .force("charge", d3.forceManyBody()
        .strength(isTinyScreen ? -50 : (isSmallScreen ? -100 : -250))
        .distanceMax(200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide()
        .radius(d => {
          const labelWidth = d.id.length * (isTinyScreen ? 5 : (isSmallScreen ? 6 : 7));
          return (d.group === 1 ? centerNodeSize : otherNodeSize) + labelWidth;
        })
        .strength(0.7))
      .force("label", d3.forceCollide()
        .radius(d => {
          const labelWidth = d.id.length * (isTinyScreen ? 5 : (isSmallScreen ? 6 : 7));
          return labelWidth;
        })
        .strength(0.5)
        .iterations(2))
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05))
      .velocityDecay(0.6)
      .alpha(0.5)
      .alphaDecay(0.05)
      .alphaMin(0.001);

    // Draw curved links with arrow markers
    const link = linkGroup
      .selectAll("path")
      .data(this.links)
      .enter()
      .append("path")
      .attr("class", "link")
      .style("stroke", "var(--text-color)")
      .style("stroke-width", "1.5px")
      .style("fill", "none")
      .style("opacity", 0.6)
      .attr("marker-end", "url(#arrow-head)"); // attach the arrow marker

    // Link hover effect – highlight link
    link.on("mouseover", function () {
      d3.select(this).transition().duration(200)
        .style("stroke-width", "3px")
        .style("opacity", 1.0);
    }).on("mouseout", function () {
      d3.select(this).transition().duration(200)
        .style("stroke-width", "1.5px")
        .style("opacity", 0.6);
    });

    // Draw nodes
    const node = nodeGroup
      .selectAll("circle")
      .data(this.nodes)
      .enter()
      .append("circle")
      .attr("r", d => d.group === 1 ? centerNodeSize : otherNodeSize)
      .attr("fill", d => {
        // Center node uses radial gradient, others random color
        return d.group === 1
          ? "url(#centerNodeGradient)"
          : colorScale(d.id);
      })
      .style("stroke", "var(--card-bg)")
      .style("stroke-width", "2px")
      .style("cursor", "pointer")
      .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.1))")
      .call(d3.drag()
        .on("start", this.dragStarted.bind(this))
        .on("drag", this.dragged.bind(this))
        .on("end", this.dragEnded.bind(this)));

    // Node hover effect: enlarge + deeper shadow
    node.on("mouseover", function (event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .style("filter", "drop-shadow(0 4px 8px rgba(0,0,0,0.3))")
        .attr("r", d.group === 1
          ? (centerNodeSize + 5)
          : (otherNodeSize + 5));
    }).on("mouseout", function (event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.1))")
        .attr("r", d.group === 1 ? centerNodeSize : otherNodeSize);
    });

    // Modify the labels creation to position them better
    const labels = labelGroup
      .selectAll("text")
      .data(this.nodes)
      .enter()
      .append("text")
      .text(d => {
        const maxLength = isTinyScreen ? 12 : (isSmallScreen ? 15 : 25);
        return d.id.length > maxLength ? d.id.substring(0, maxLength) + '...' : d.id;
      })
      .attr("font-size", fontSize)
      .attr("font-family", "'Segoe UI', system-ui, -apple-system, sans-serif")
      .style("fill", "var(--text-color)")
      .style("font-weight", d => (d.group === 1 ? "600" : "400"))
      .attr("text-anchor", "middle") // Center the text
      .attr("dy", d => (d.group === 1 ? centerNodeSize + 20 : otherNodeSize + 15)) // Position below node
      .style("pointer-events", "none");

    // Update the tick function to handle label positioning
    this.simulation.on("tick", () => {
      link.attr("d", d => {
        const dx = d.target.x - d.source.x,
              dy = d.target.y - d.source.y,
              dr = Math.sqrt(dx * dx + dy * dy) * 2;
        return `M${d.source.x},${d.source.y}
                A${dr},${dr} 0 0,1
                ${d.target.x},${d.target.y}`;
      });

      // Keep nodes within bounds
      node
        .attr("cx", d => d.x = Math.max(50, Math.min(width - 50, d.x)))
        .attr("cy", d => d.y = Math.max(50, Math.min(height - 50, d.y)));

      // Position labels centered below nodes
      labels
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    });

    // When user clicks a node, update articles and dispatch event
    node.on("click", async (event, d) => {
      // Update reading history
      const readingHistory = JSON.parse(localStorage.getItem('readingHistory') || '[]');
      readingHistory.unshift({ topic: d.id, timestamp: Date.now() });
      localStorage.setItem('readingHistory', JSON.stringify(readingHistory.slice(0, 10))); // Keep last 10

      // Dispatch event for any other listeners
      const customEvent = new CustomEvent('graphNodeClick', { detail: { title: d.id } });
      this.container.dispatchEvent(customEvent);
    });
  }

  // Update the updateArticles method to handle multiple topics
  async updateArticles(topics) {
    const articlesGrid = document.getElementById('articles-grid');
    const apiUrl = "https://en.wikipedia.org/w/api.php";
    
    try {
        articlesGrid.innerHTML = '<p>Loading articles...</p>'; // Loading indicator
        
        // Create a map to store articles by topic
        const articlesByTopic = new Map();
        
        // Fetch articles for each topic
        const fetchPromises = topics.map(async topic => {
            const params = new URLSearchParams({
                action: "query",
                format: "json",
                origin: "*",
                generator: "search",
                gsrsearch: topic, // Removed exact match to get more results
                gsrlimit: "3", // Increased to 3 results per topic
                prop: "pageimages|extracts",
                exintro: "1",
                explaintext: "1",
                pithumbsize: "400"
            });

            try {
                const response = await fetch(`${apiUrl}?${params.toString()}`);
                const data = await response.json();
                
                if (data.query && data.query.pages) {
                    const articles = Object.values(data.query.pages);
                    console.log(`Found ${articles.length} articles for topic: ${topic}`, articles); // Debug log
                    
                    articlesByTopic.set(topic, articles.map(page => ({
                        title: page.title,
                        extract: page.extract || 'No summary available.',
                        thumbnail: page.thumbnail?.source,
                        pageid: page.pageid,
                        topic: topic
                    })));
                } else {
                    console.log(`No results found for topic: ${topic}`); // Debug log
                }
            } catch (error) {
                console.error(`Error fetching articles for ${topic}:`, error);
            }
        });

        // Wait for all fetches to complete
        await Promise.all(fetchPromises);
        
        articlesGrid.innerHTML = ''; // Clear loading message
        
        // Helper function to shuffle array
        const shuffleArray = (array) => {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        };
        
        // Sort articles to show center topic first
        const centerTopic = topics[0];
        let centerArticles = [];
        let otherArticles = [];
        
        // Separate center topic articles and other articles
        if (articlesByTopic.has(centerTopic)) {
            centerArticles = articlesByTopic.get(centerTopic);
        }
        
        // Collect and shuffle other topics' articles
        topics.slice(1).forEach(topic => {
            if (articlesByTopic.has(topic)) {
                otherArticles.push(...articlesByTopic.get(topic));
            }
        });
        
        // Shuffle both arrays
        centerArticles = shuffleArray(centerArticles);
        otherArticles = shuffleArray(otherArticles);
        
        // Combine arrays, keeping some center articles at the start
        const numCenterArticlesToKeepAtTop = Math.min(2, centerArticles.length);
        const topCenterArticles = centerArticles.slice(0, numCenterArticlesToKeepAtTop);
        const remainingCenterArticles = centerArticles.slice(numCenterArticlesToKeepAtTop);
        
        // Combine and shuffle the remaining articles
        const remainingArticles = shuffleArray([...remainingCenterArticles, ...otherArticles]);
        
        // Final array combines fixed center articles with shuffled remaining articles
        const allArticles = [...topCenterArticles, ...remainingArticles];

        // Create article cards
        allArticles.forEach(article => {
            const articleElement = document.createElement('div');
            articleElement.className = 'article-preview';
            
            if (article.topic === centerTopic) {
                articleElement.classList.add('center-topic');
            }
            
            // Improved article card layout with added cursor style and click handler
            articleElement.innerHTML = `
                <div class="article-card" style="cursor: pointer;">
                    ${article.thumbnail ? 
                        `<div class="article-image">
                            <img src="${article.thumbnail}" alt="${article.title}">
                        </div>` : 
                        '<div class="article-image-placeholder"></div>'
                    }
                    <div class="article-content">
                        <h3>${article.title}</h3>
                        <p>${article.extract ? article.extract.substring(0, 150) + '...' : 'No summary available.'}</p>
                        <div class="article-footer">
                            <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(article.title)}" 
                               target="_blank" 
                               class="read-more-link"
                               onclick="event.stopPropagation();">
                               Read on Wikipedia →
                            </a>
                            ${article.topic === centerTopic ? 
                                '<span class="topic-badge">Main Topic</span>' : 
                                `<span class="topic-badge">Related to: ${article.topic}</span>`
                            }
                        </div>
                    </div>
                </div>
            `;

            // Add click handler to the article card
            articleElement.addEventListener('click', () => {
                const customEvent = new CustomEvent('graphNodeClick', { 
                    detail: { title: article.title } 
                });
                this.container.dispatchEvent(customEvent);
            });
            
            articlesGrid.appendChild(articleElement);
        });

        // If no articles were found, show a message
        if (allArticles.length === 0) {
            articlesGrid.innerHTML = `
                <div class="no-results">
                    <p>No articles found for the selected topics.</p>
                    <p>Topics searched: ${topics.join(', ')}</p>
                </div>`;
        }
    } catch (error) {
        console.error("Error fetching articles:", error);
        articlesGrid.innerHTML = `
            <div class="error-message">
                <p>Error loading articles. Please try again.</p>
                <p>Error details: ${error.message}</p>
            </div>`;
    }
  }

  // Force-directed drag handlers
  dragStarted(event, d) {
    if (!event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  dragEnded(event, d) {
    if (!event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
};
