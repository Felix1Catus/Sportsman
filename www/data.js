/* Sportsman — static data: foods, meal templates, default workout plan, nag messages */

// per 100 g (cooked / as eaten). raw = multiplier to convert to shopping weight. unit = natural unit.
const F = (id, name, cat, kcal, p, c, f, extra = {}) => ({ id, name, cat, kcal, p, c, f, raw: 1, aisle: 'Pantry', ...extra });
const FOODS_LIST = [
  // protein
  F('chicken', 'Chicken breast', 'protein', 165, 31, 0, 3.6, { raw: 1.35, aisle: 'Meat & fish' }),
  F('beef', 'Lean beef mince (5%)', 'protein', 200, 27, 0, 10, { raw: 1.3, aisle: 'Meat & fish' }),
  F('salmon', 'Salmon fillet', 'protein', 206, 22, 0, 12, { raw: 1.2, aisle: 'Meat & fish' }),
  F('turkey', 'Turkey breast', 'protein', 135, 30, 0, 1, { raw: 1.3, aisle: 'Meat & fish' }),
  F('tuna', 'Tuna (canned, water)', 'protein', 116, 26, 0, 1, { aisle: 'Pantry' }),
  F('eggs', 'Eggs', 'protein', 143, 12.6, 0.7, 9.5, { unit: { n: 'egg', g: 50 }, aisle: 'Dairy & eggs' }),
  F('yogurt', 'Greek yogurt (2%)', 'protein', 73, 10, 4, 2, { aisle: 'Dairy & eggs' }),
  F('cottage', 'Cottage cheese', 'protein', 98, 11, 3.4, 4.3, { aisle: 'Dairy & eggs' }),
  F('whey', 'Whey protein', 'protein', 400, 80, 8, 6, { unit: { n: 'scoop', g: 30 }, aisle: 'Pantry' }),
  F('milk', 'Milk (whole)', 'protein', 61, 3.2, 4.8, 3.3, { unit: { n: 'cup', g: 240 }, aisle: 'Dairy & eggs' }),
  F('lentils', 'Lentils (cooked)', 'protein', 116, 9, 20, 0.4, { raw: 0.4, aisle: 'Pantry' }),
  F('tofu', 'Firm tofu', 'protein', 144, 17, 3, 9, { aisle: 'Dairy & eggs' }),
  // carbs
  F('rice', 'White rice (cooked)', 'carb', 130, 2.7, 28, 0.3, { raw: 0.35 }),
  F('brownrice', 'Brown rice (cooked)', 'carb', 123, 2.7, 26, 1, { raw: 0.37 }),
  F('pasta', 'Pasta (cooked)', 'carb', 158, 5.8, 31, 0.9, { raw: 0.42 }),
  F('potato', 'Potato (boiled)', 'carb', 87, 2, 20, 0.1, { aisle: 'Produce' }),
  F('sweetpotato', 'Sweet potato (baked)', 'carb', 90, 2, 21, 0.2, { aisle: 'Produce' }),
  F('oats', 'Oats (dry)', 'carb', 389, 16.9, 66, 6.9, {}),
  F('bread', 'Whole-wheat bread', 'carb', 252, 12, 43, 3.5, { unit: { n: 'slice', g: 35 }, aisle: 'Bakery' }),
  F('wrap', 'Tortilla wrap', 'carb', 310, 8, 50, 8, { unit: { n: 'wrap', g: 60 }, aisle: 'Bakery' }),
  F('couscous', 'Couscous (cooked)', 'carb', 112, 3.8, 23, 0.2, { raw: 0.4 }),
  F('bulgur', 'Bulgur (cooked)', 'carb', 83, 3, 19, 0.2, { raw: 0.4 }),
  F('banana', 'Banana', 'carb', 89, 1.1, 23, 0.3, { unit: { n: 'banana', g: 118 }, aisle: 'Produce' }),
  F('apple', 'Apple', 'carb', 52, 0.3, 14, 0.2, { unit: { n: 'apple', g: 180 }, aisle: 'Produce' }),
  F('dates', 'Dates', 'carb', 282, 2.5, 75, 0.4, { unit: { n: 'date', g: 24 }, aisle: 'Produce' }),
  // veg
  F('broccoli', 'Broccoli', 'veg', 35, 2.4, 7, 0.4, { aisle: 'Produce' }),
  F('mixveg', 'Mixed vegetables', 'veg', 65, 3, 13, 0.5, { aisle: 'Produce' }),
  F('salad', 'Salad (greens, tomato, cucumber)', 'veg', 20, 1.2, 4, 0.2, { aisle: 'Produce' }),
  F('spinach', 'Spinach', 'veg', 23, 2.9, 3.6, 0.4, { aisle: 'Produce' }),
  F('greenbeans', 'Green beans', 'veg', 31, 1.8, 7, 0.2, { aisle: 'Produce' }),
  F('zucchini', 'Zucchini', 'veg', 17, 1.2, 3.1, 0.3, { aisle: 'Produce' }),
  // fats
  F('oliveoil', 'Olive oil', 'fat', 884, 0, 0, 100, { unit: { n: 'tbsp', g: 14, half: true } }),
  F('pb', 'Peanut butter', 'fat', 588, 25, 20, 50, { unit: { n: 'tbsp', g: 16, half: true } }),
  F('avocado', 'Avocado', 'fat', 160, 2, 9, 15, { aisle: 'Produce' }),
  F('almonds', 'Almonds', 'fat', 579, 21, 22, 50, {}),
  F('walnuts', 'Walnuts', 'fat', 654, 15, 14, 65, {}),
  F('tahini', 'Tahini', 'fat', 595, 17, 21, 54, { unit: { n: 'tbsp', g: 15, half: true } }),
];
const FOODS = Object.fromEntries(FOODS_LIST.map(f => [f.id, f]));

// Meal combos: [protein, carb, veg, fat] (null = role not used)
const COMBOS = {
  breakfast: [
    ['eggs', 'bread', 'spinach', 'avocado'],
    ['yogurt', 'oats', null, 'pb'],
    ['eggs', 'wrap', 'spinach', 'avocado'],
    ['cottage', 'bread', null, 'walnuts'],
    ['whey', 'oats', null, 'pb'],
  ],
  lunch: [
    ['chicken', 'rice', 'broccoli', 'oliveoil'],
    ['beef', 'pasta', 'mixveg', 'oliveoil'],
    ['salmon', 'sweetpotato', 'greenbeans', 'oliveoil'],
    ['turkey', 'couscous', 'salad', 'avocado'],
    ['tuna', 'rice', 'salad', 'oliveoil'],
    ['chicken', 'potato', 'greenbeans', 'oliveoil'],
    ['lentils', 'brownrice', 'zucchini', 'oliveoil'],
  ],
  dinner: [
    ['beef', 'rice', 'broccoli', 'oliveoil'],
    ['chicken', 'pasta', 'mixveg', 'oliveoil'],
    ['salmon', 'rice', 'greenbeans', 'oliveoil'],
    ['chicken', 'bulgur', 'salad', 'oliveoil'],
    ['turkey', 'potato', 'broccoli', 'oliveoil'],
    ['tofu', 'brownrice', 'mixveg', 'oliveoil'],
    ['beef', 'sweetpotato', 'spinach', 'oliveoil'],
  ],
  snack: [
    ['yogurt', 'banana', null, 'almonds'],
    ['whey', 'apple', null, 'almonds'],
    ['cottage', 'dates', null, 'walnuts'],
    ['yogurt', 'apple', null, 'pb'],
  ],
  pre: [ // pre-workout, per the plan: banana + peanut butter OR oats
    ['milk', 'banana', null, 'pb'],
    ['milk', 'oats', null, null],
  ],
};
const SLOT_META = {
  breakfast: { label: 'Breakfast', share: 25, icon: '🍳' },
  lunch: { label: 'Lunch', share: 30, icon: '🍛' },
  snack: { label: 'Snack', share: 15, icon: '🍌' },
  pre: { label: 'Pre-workout', share: 15, icon: '⚡' },
  dinner: { label: 'Dinner', share: 30, icon: '🍽️' },
};
const ROLES = ['protein', 'carb', 'veg', 'fat'];

// Default plan from the uploaded PDF (Complete Muscle Memory & Conditioning Plan)
const DEFAULT_PLAN = [
  { name: 'Leg Press Machine', muscle: 'Quads & Glutes', sets: 3, reps: '12-15', weight: 0, rest: 90 },
  { name: 'Lat Pulldown', muscle: 'Lats (back width)', sets: 3, reps: '12-15', weight: 0, rest: 60 },
  { name: 'Flat Dumbbell Bench Press', muscle: 'Chest', sets: 3, reps: '12-15', weight: 0, rest: 60 },
  { name: 'Lying Leg Curl Machine', muscle: 'Hamstrings', sets: 2, reps: '12-15', weight: 0, rest: 60 },
  { name: 'Seated Dumbbell Shoulder Press', muscle: 'Shoulders', sets: 2, reps: '12-15', weight: 0, rest: 60 },
  { name: 'Seated Cable Row', muscle: 'Mid-back (thickness)', sets: 2, reps: '12-15', weight: 0, rest: 60 },
  { name: 'Dumbbell Biceps Curl (alternate)', muscle: 'Biceps', sets: 2, reps: '12', weight: 0, rest: 45 },
  { name: 'Plank Hold', muscle: 'Core & abs', sets: 3, reps: '30-45 sec', weight: 0, rest: 45 },
];
const CARDIO = {
  early: { title: 'Cardio · 15 min LISS', text: 'Fast incline walk on the treadmill or the elliptical. Right after weights.' },
  late: { title: 'Cardio · 15 min light HIIT', text: 'Stationary bike: 30 s all-out sprint, 60 s slow pedal. Repeat for 15 min.' },
};

const GOALS = {
  lean: { label: 'Lean bulk', adj: 0.12, protein: 2.0, note: 'Small surplus. Muscle up, minimal fat.' },
  bulk: { label: 'Bulk', adj: 0.20, protein: 2.0, note: 'Bigger surplus. Faster size, some fat.' },
  maintain: { label: 'Maintain', adj: 0, protein: 1.8, note: 'Hold your weight steady.' },
  cut: { label: 'Weight loss', adj: -0.20, protein: 2.2, note: 'Deficit. Lose fat, keep muscle.' },
};
const ACTIVITY = [
  [1.2, 'Sedentary (desk, no exercise)'],
  [1.375, 'Light (1–3 workouts / week)'],
  [1.55, 'Moderate (3–5 workouts / week)'],
  [1.725, 'Very active (6–7 workouts / week)'],
];

// Nag lines — blunt, escalating
const NAG = {
  noFood: [
    'Nothing logged today. You cannot build muscle on air. Eat something and log it.',
    'Zero calories logged. Your muscles are waiting. Eat.',
    'Empty log. Skipping meals is how a bulk dies. Fix it now.',
  ],
  mealLate: [
    '{meal} was at {time}. Nothing logged. Eat it, then tap Log.',
    'You are late on {meal} ({time}). Late meals are missed gains.',
    '{meal} slipped by. Do not stack skipped meals. Eat now.',
  ],
  eveningLow: [
    'You are at {pct}% of your calories and the day is almost over. Eat a real meal tonight.',
    'Only {pct}% of today’s target. Close the gap before bed. Milk, oats, peanut butter. Go.',
  ],
  yesterdayLow: [
    'Yesterday you hit only {pct}% of your calories. A bulk on 60% is just a diet. Do better today.',
  ],
  foodGap: [
    'You have not logged food in {n} days. That is not a plan, that is hoping.',
  ],
  gymToday: [
    'Gym day. {n} exercises, 45 minutes max. You do not need motivation, just show up.',
    'Today is a training day. The plan is short on purpose. No excuses.',
  ],
  gymLate: [
    'It is past gym time and the workout has not started. Go now. 45 minutes and done.',
    'You said {time}. It is later than that. Shoes on, go.',
  ],
  gymMissed: [
    'You skipped {day}. Do not skip the next one. Show up today if you can.',
  ],
  gymGap: [
    '{n} days since your last workout. Last time you stopped after one session. Do not repeat it.',
    '{n} days off. Muscle memory fades. One session today restarts it.',
  ],
  neverTrained: [
    'You have not logged a single workout yet. Tap Train and press Start.',
  ],
  inactive: [ // notification ladder when the app has not been opened
    'Sportsman here. You have not checked in. Log your food and get to the gym.',
    '2 days gone. This is exactly how you quit last time. Open the app.',
    '3 days without a check-in. The plan only works if you do. Open Sportsman.',
    'It has been a while. One workout, one proper meal. Start there.',
  ],
};
