export const KEYWORD_GROUPS = {
  email: [
    "email",
    "mail",
    "email address",
    "work email",
    "contact email",
    "recruiter email",
    "official email",
    "candidate email"
  ],
  name: [
    "name",
    "full name",
    "employee",
    "employee name",
    "candidate",
    "recruiter",
    "hr name",
    "first name",
    "last name"
  ],
  company: [
    "company",
    "organization",
    "firm",
    "startup",
    "business",
    "company name"
  ],
  role: [
    "role",
    "position",
    "job role",
    "designation",
    "title",
    "job title"
  ]
};

export function detectColumns(headers) {
  const mappings = {
    email: '',
    name: '',
    company: '',
    role: ''
  };

  const confidence = {
    email: 0,
    name: 0,
    company: 0,
    role: 0
  };

  // Normalization helper (e.g., "First Name", "first_name" -> "firstname")
  const normalize = (str) => String(str).toLowerCase().replace(/[^a-z0-9]/g, '');

  headers.forEach((header) => {
    const normalizedHeader = normalize(header);

    for (const [key, keywords] of Object.entries(KEYWORD_GROUPS)) {
      let bestScoreForHeader = 0;

      for (const keyword of keywords) {
        const normalizedKeyword = normalize(keyword);
        let score = 0;

        if (normalizedHeader === normalizedKeyword) {
          score = 100; // Exact match
        } else if (normalizedHeader.includes(normalizedKeyword)) {
          score = 80; // Substring match
        } else if (normalizedKeyword.includes(normalizedHeader) && normalizedHeader.length > 3) {
          score = 60; // Reverse substring match
        }

        if (score > bestScoreForHeader) {
          bestScoreForHeader = score;
        }
      }

      if (bestScoreForHeader > confidence[key]) {
        confidence[key] = bestScoreForHeader;
        mappings[key] = header;
      }
    }
  });

  return { mappings, confidence };
}
