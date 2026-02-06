import { RoundConfig, Question, Category, QuestionType, CategoryContent } from '../types';
import { CATEGORIES } from '../constants';

// Simple CSV parser that handles quoted fields
const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
};

export const parseImportData = (csvData: string): { [categoryId: string]: CategoryContent } => {
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
        throw new Error("Import data must have a header and at least one question row.");
    }

    const header = parseCSVLine(lines[0].toLowerCase());
    const rows = lines.slice(1).map(line => parseCSVLine(line));

    const colMap: { [key: string]: number } = {};
    const requiredCols = ['category', 'question', 'option1', 'correctanswer'];
    
    header.forEach((h, i) => {
        colMap[h.trim().replace(/\s/g, '')] = i;
    });

    for (const col of requiredCols) {
        if (colMap[col] === undefined) {
            throw new Error(`Missing required column: ${col}. Please check your file header.`);
        }
    }

    const roundsConfig: { [categoryId: string]: CategoryContent } = {};

    rows.forEach((row, rowIndex) => {
        try {
            const categoryName = row[colMap['category']];
            const questionText = row[colMap['question']];
            const typeStr = colMap['type'] !== undefined ? row[colMap['type']].toUpperCase() : '';
            
            let questionType: QuestionType = QuestionType.MULTIPLE_CHOICE;
            if (Object.values(QuestionType).includes(typeStr as QuestionType)) {
                questionType = typeStr as QuestionType;
            }

            const options = [
                row[colMap['option1']],
                row[colMap['option2']],
                row[colMap['option3']],
                row[colMap['option4']],
            ].filter(opt => opt && opt.trim() !== '');
            
            const correctAnswerStr = row[colMap['correctanswer']];
            const explanation = colMap['explanation'] !== undefined ? row[colMap['explanation']] : 'No explanation provided.';

            if (!categoryName || !questionText || options.length < 1 || !correctAnswerStr) {
                console.warn(`Skipping incomplete row ${rowIndex + 2}`);
                return;
            }

            let correctIndex = 0;
            let finalOptions = options;

            if (!typeStr) {
                const lowerCaseOptions = options.map(o => o.toLowerCase());
                if (options.length === 2 && lowerCaseOptions.includes('true') && lowerCaseOptions.includes('false')) {
                    questionType = QuestionType.TRUE_FALSE;
                }
            }

            switch(questionType) {
                case QuestionType.TRUE_FALSE:
                    finalOptions = ['True', 'False'];
                    correctIndex = correctAnswerStr.toLowerCase() === 'true' ? 0 : 1;
                    break;
                case QuestionType.TYPE_ANSWER:
                    finalOptions = options;
                    correctIndex = 0;
                    break;
                case QuestionType.SLIDER:
                    finalOptions = options.slice(0, 5); // min, max, step, low, high
                    correctIndex = 0;
                    break;
                case QuestionType.PUZZLE:
                    finalOptions = options;
                    correctIndex = 0;
                    break;
                case QuestionType.MULTIPLE_CHOICE:
                default:
                    correctIndex = options.findIndex(o => o.toLowerCase() === correctAnswerStr.toLowerCase());
                    if (correctIndex === -1) {
                        console.warn(`Correct answer "${correctAnswerStr}" not found in options for row ${rowIndex + 2}. Defaulting to first option.`);
                        correctIndex = 0;
                    }
                    break;
            }

            const question: Question = {
                id: `import-${categoryName}-${rowIndex}`,
                category: categoryName,
                text: questionText,
                options: finalOptions,
                correctIndex,
                explanation,
                type: questionType,
            };

            const categoryInfo = CATEGORIES.find(c => c.name.toLowerCase() === categoryName.toLowerCase()) || {
                id: categoryName.toLowerCase().replace(/\s/g, ''),
                name: categoryName,
                icon: '❓',
                color: 'bg-slate-500'
            };

            if (!roundsConfig[categoryInfo.id]) {
                roundsConfig[categoryInfo.id] = {
                    category: categoryInfo,
                    questions: []
                };
            }
            roundsConfig[categoryInfo.id].questions.push(question);
        } catch (e) {
            console.error(`Error parsing row ${rowIndex + 2}:`, e);
        }
    });

    if (Object.keys(roundsConfig).length === 0) {
        throw new Error("No valid questions could be parsed from the data.");
    }

    return roundsConfig;
};

export const fetchFromGoogleSheet = async (url: string): Promise<string> => {
    if (!url.includes('docs.google.com/spreadsheets/d/')) {
        throw new Error("Invalid Google Sheet URL.");
    }

    const sheetIdRegex = /spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const gidRegex = /gid=([0-9]+)/;
    
    const sheetIdMatch = url.match(sheetIdRegex);
    const gidMatch = url.match(gidRegex);

    if (!sheetIdMatch) {
        throw new Error("Could not extract Sheet ID from the URL.");
    }

    const sheetId = sheetIdMatch[1];
    const gid = gidMatch ? gidMatch[1] : '0';

    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const response = await fetch(exportUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch from Google Sheet. Status: ${response.status}. Make sure the sheet is public ('Anyone with the link can view').`);
    }
    return response.text();
};

const escapeCsvField = (field: string | undefined): string => {
    if (field === undefined || field === null) {
        return '';
    }
    const stringField = String(field);
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
        const escapedField = stringField.replace(/"/g, '""');
        return `"${escapedField}"`;
    }
    return stringField;
};

export const exportRoundsToCSV = (roundsConfig: { [categoryId: string]: CategoryContent }): string => {
    const header = ['type', 'category', 'question', 'option1', 'option2', 'option3', 'option4', 'option5', 'correctAnswer', 'explanation'];
    const rows: string[] = [header.join(',')];

    Object.values(roundsConfig).forEach(content => {
        content.questions.forEach(q => {
            let correctAnswer = '';
            let options = [...q.options];

            switch(q.type) {
                case QuestionType.SLIDER:
                    correctAnswer = `${q.options[3]}-${q.options[4]}`; // e.g. "1968-1972"
                    break;
                case QuestionType.TYPE_ANSWER:
                    correctAnswer = q.options[0];
                    break;
                case QuestionType.PUZZLE:
                    correctAnswer = q.options.join('|'); // Use a pipe to separate puzzle answers
                    break;
                case QuestionType.MULTIPLE_CHOICE:
                case QuestionType.TRUE_FALSE:
                default:
                    correctAnswer = q.options[q.correctIndex];
                    break;
            }
            
            while (options.length < 5) {
                options.push('');
            }

            const row = [
                q.type,
                content.category.name,
                q.text,
                ...options.slice(0, 5),
                correctAnswer,
                q.explanation
            ].map(escapeCsvField);
            rows.push(row.join(','));
        });
    });

    return rows.join('\n');
};