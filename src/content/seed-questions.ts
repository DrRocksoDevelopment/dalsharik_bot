import type { Question } from '../game/question.js';

export const SEED_QUESTIONS: Question[] = [
  {
    id: 'event_000001',
    type: 'historical_next_event',
    category: 'history',
    difficulty: 2,
    eventDate: '1969-07-20',
    event: {
      title: 'Высадка Apollo 11 на Луну',
      context: '20 июля 1969 года Нил Армстронг первым в истории ступил на поверхность Луны.',
    },
    question: 'Что сделали астронавты сразу после выхода на поверхность Луны?',
    answers: [
      { id: 'A', text: 'Установили флаг США и собрали образцы лунного грунта' },
      { id: 'B', text: 'Срочно вернулись в модуль из-за утечки кислорода' },
      { id: 'C', text: 'Запустили с Луны спутник связи' },
      { id: 'D', text: 'Дождались прибытия советского лунохода' },
    ],
    correctAnswer: 'A',
    explanation:
      'Армстронг и Олдрин провели на поверхности около 2 часов: установили флаг, развернули научные приборы и собрали порядка 21,5 кг образцов грунта.',
    sources: [
      'https://www.nasa.gov/mission_pages/apollo/apollo11.html',
      'https://www.history.com/this-day-in-history/apollo-11-lands-on-the-moon',
    ],
    createdAt: '2026-08-09T00:00:00.000Z',
  },
  {
    id: 'event_000002',
    type: 'historical_next_event',
    category: 'history',
    difficulty: 2,
    eventDate: '1989-11-09',
    event: {
      title: 'Падение Берлинской стены',
      context: '9 ноября 1989 года пограничные переходы между Западным и Восточным Берлином открылись, стена пала.',
    },
    question: 'Каким событием завершилось объединение Германии после падения стены?',
    answers: [
      { id: 'A', text: '3 октября 1990 года ГДР вошла в состав ФРГ, образовав единую Германию' },
      { id: 'B', text: 'Восточный Берлин объявил независимость' },
      { id: 'C', text: 'Германия разделилась на три новые республики' },
      { id: 'D', text: 'СССР получил контроль над Западным Берлином' },
    ],
    correctAnswer: 'A',
    explanation:
      'Объединение состоялось 3 октября 1990 года: ГДР присоединилась к ФРГ по статье 23 Основного закона. Эта дата стала национальным праздником Германии.',
    sources: [
      'https://www.dw.com/en/berlin-wall-anniversary/a-51125075',
      'https://www.britannica.com/event/Berlin-Wall',
    ],
    createdAt: '2026-08-09T00:00:00.000Z',
  },
  {
    id: 'event_000003',
    type: 'scientific_next_event',
    category: 'science',
    difficulty: 3,
    eventDate: '1796-05-14',
    event: {
      title: 'Первая вакцинация Эдварда Дженнера',
      context: 'В мае 1796 года Эдвард Дженнер привил восьмилетнему Джеймсу Фиппсу коровью оспу.',
    },
    question: 'Как Дженнер доказал, что прививка действительно защищает от натуральной оспы?',
    answers: [
      { id: 'A', text: 'Через несколько недель он привил мальчику настоящую оспу, и тот не заболел' },
      { id: 'B', text: 'Мальчик сразу заболел оспой и тяжело перенёс болезнь' },
      { id: 'C', text: 'Дженнер повторил прививку на сотнях коров' },
      { id: 'D', text: 'Он отправил образец в Королевское общество и дождался одобрения' },
    ],
    correctAnswer: 'A',
    explanation:
      'В июле 1796 года Дженнер привил Фиппсу содержимое пустулы натуральной оспы. Мальчик не заболел — это доказало защитный эффект вакцинации.',
    sources: [
      'https://www.history.com/topics/inventions/history-of-vaccines',
      'https://www.cdc.gov/vaccines/basics/history-of-vaccines.html',
    ],
    createdAt: '2026-08-09T00:00:00.000Z',
  },
  {
    id: 'event_000004',
    type: 'scientific_next_event',
    category: 'science',
    difficulty: 2,
    eventDate: '1928-09-03',
    event: {
      title: 'Случайное открытие пенициллина',
      context: 'Вернувшись из отпуска, Александр Флеминг заметил плесень Penicillium, вокруг которой погибли стафилококки.',
    },
    question: 'Что Флеминг сделал с открытой им плесенью?',
    answers: [
      { id: 'A', text: 'Выделил активное вещество и назвал его пенициллином' },
      { id: 'B', text: 'Выбросил заражённые чашки Петри' },
      { id: 'C', text: 'Уничтожил плесень как опасную' },
      { id: 'D', text: 'Передал образец конкурентам без публикации' },
    ],
    correctAnswer: 'A',
    explanation:
      'Флеминг определил, что плесень выделяет вещество, убивающее бактерии, и назвал его пенициллином. Массовое производство наладили лишь в 1940-х.',
    sources: [
      'https://www.sciencemuseum.org.uk/objects-and-stories/penicillin',
      'https://www.britannica.com/science/penicillin',
    ],
    createdAt: '2026-08-09T00:00:00.000Z',
  },
  {
    id: 'event_000005',
    type: 'technology_next_event',
    category: 'technology',
    difficulty: 2,
    eventDate: '1903-12-17',
    event: {
      title: 'Первый полёт братьев Райт',
      context: '17 декабря 1903 года в Китти-Хок «Flyer» впервые совершил управляемый моторный полёт.',
    },
    question: 'Что произошло после самого первого полёта аппарата братьев Райт?',
    answers: [
      { id: 'A', text: 'В тот же день состоялись ещё три полёта, самый дальний — 260 метров' },
      { id: 'B', text: 'Аппарат немедленно перевезли в музей' },
      { id: 'C', text: 'Братья объявили о создании пассажирских авиалиний' },
      { id: 'D', text: 'Второй полёт закончился крушением аппарата' },
    ],
    correctAnswer: 'A',
    explanation:
      'Первый полёт длился 12 секунд, но за день братья совершили четыре полёта. Лучший из них — 59 секунд и 260 метров — превысил первый по всем показателям.',
    sources: [
      'https://www.si.edu/spotlight/wright-brothers',
      'https://www.nasa.gov/audience/forstudents/k-4/stories/first-flight-a-847.html',
    ],
    createdAt: '2026-08-09T00:00:00.000Z',
  },
  {
    id: 'event_000006',
    type: 'technology_next_event',
    category: 'technology',
    difficulty: 3,
    eventDate: '1957-10-04',
    event: {
      title: 'Запуск первого искусственного спутника Земли',
      context: '4 октября 1957 года СССР вывел на орбиту «Спутник-1» — первый искусственный спутник Земли.',
    },
    question: 'Что было выведено на орбиту следующим после «Спутника-1»?',
    answers: [
      { id: 'A', text: '«Спутник-2» с собакой Лайкой' },
      { id: 'B', text: 'Советский пилотируемый корабль «Восток-1»' },
      { id: 'C', text: 'Американский спутник «Эксплорер-1»' },
      { id: 'D', text: 'Первая орбитальная станция' },
    ],
    correctAnswer: 'A',
    explanation:
      'Через месяц, 3 ноября 1957 года, был запущен «Спутник-2» с собакой Лайкой — первым живым существом на орбите Земли.',
    sources: [
      'https://www.nasa.gov/history/sputnik/',
      'https://www.esa.int/About_Us/ESA_history/50_years_of_space_Exploration/First_animal_in_orbit',
    ],
    createdAt: '2026-08-09T00:00:00.000Z',
  },
  {
    id: 'event_000007',
    type: 'culture_next_event',
    category: 'culture',
    difficulty: 1,
    eventDate: '1964-02-09',
    event: {
      title: 'Первое выступление The Beatles в США',
      context: '9 февраля 1964 года The Beatles впервые выступили в телешоу Эда Салливана.',
    },
    question: 'Что произошло после того, как The Beatles выступили на шоу Эда Салливана?',
    answers: [
      { id: 'A', text: 'Эфир побил рекорд телеаудитории и запустил «британское вторжение»' },
      { id: 'B', text: 'Шоу отменили из-за протестов зрителей' },
      { id: 'C', text: 'Группа распалась сразу после эфира' },
      { id: 'D', text: 'Выступление не транслировалось за пределами Нью-Йорка' },
    ],
    correctAnswer: 'A',
    explanation:
      'Шоу посмотрело около 73 миллионов американцев — рекорд для телевидения. Успех открыл дорогу множеству британских групп и начал «британское вторжение».',
    sources: [
      'https://www.britannica.com/topic/Beatles-first-Ed-Sullivan-appearance',
      'https://www.pbs.org/newshour/arts/the-night-the-beatles-changed-american-tv',
    ],
    createdAt: '2026-08-09T00:00:00.000Z',
  },
  {
    id: 'event_000008',
    type: 'culture_next_event',
    category: 'culture',
    difficulty: 4,
    eventDate: '1911-08-21',
    event: {
      title: 'Кража «Моны Лизы» из Лувра',
      context: 'В августе 1911 года сотрудник Лувра Винченцо Перуджа похитил «Мону Лизу» прямо из зала музея.',
    },
    question: 'Как закончилась история кражи «Моны Лизы»?',
    answers: [
      { id: 'A', text: 'Картину нашли спустя два года, когда Перуджа попытался продать её во Флоренции' },
      { id: 'B', text: 'Картина была уничтожена вором' },
      { id: 'C', text: 'Лувр заменил её копией и закрыл дело' },
      { id: 'D', text: 'Полиция поймала вора в зале музея в день кражи' },
    ],
    correctAnswer: 'A',
    explanation:
      'Перуджа хранил картину два года и в 1913 году попытался продать её галерейщику во Флоренции. Картину вернули в Лувр, а преступника осудили.',
    sources: [
      'https://www.bbc.com/culture/article/20130821-the-great-mona-lisa-heist',
      'https://www.louvre.fr/en/explore/the-palace/the-monumental-and-exceptional-history-of-the-mona-lisa',
    ],
    createdAt: '2026-08-09T00:00:00.000Z',
  },
  {
    id: 'event_000009',
    type: 'geography_next_event',
    category: 'geography',
    difficulty: 2,
    eventDate: '1953-05-29',
    event: {
      title: 'Первое восхождение на Эверест',
      context: '29 мая 1953 года Эдмунд Хиллари и Тенцинг Норгей первыми достигли вершины Эвереста (8849 м).',
    },
    question: 'Что сделали первовосходители после достижения вершины?',
    answers: [
      { id: 'A', text: 'Оставили флаги и небольшой крест, сделали снимки и благополучно спустились' },
      { id: 'B', text: 'Провели на вершине целую неделю' },
      { id: 'C', text: 'Остались ждать следующую экспедицию' },
      { id: 'D', text: 'Сразу разбили лагерь у вершины' },
    ],
    correctAnswer: 'A',
    explanation:
      'Хиллари и Норгей пробыли на вершине около 15 минут: сделали фотографии, оставили флаги и крест, затем успешно спустились в базовый лагерь.',
    sources: [
      'https://www.britannica.com/biography/Edmund-Hillary',
      'https://www.nationalgeographic.com/adventure/article/first-ascent-everest-1953-hillary-norgay',
    ],
    createdAt: '2026-08-09T00:00:00.000Z',
  },
  {
    id: 'event_000010',
    type: 'geography_next_event',
    category: 'geography',
    difficulty: 3,
    eventDate: '1914-08-15',
    event: {
      title: 'Открытие Панамского канала',
      context: '15 августа 1914 года первый корабль — грузовое судно SS Ancon — прошёл по Панамскому каналу.',
    },
    question: 'Что произошло после первого официального прохода по Панамскому каналу?',
    answers: [
      { id: 'A', text: 'Торжественное открытие отменили из-за начала Первой мировой войны' },
      { id: 'B', text: 'Канал немедленно закрыли из-за разрушения шлюзов' },
      { id: 'C', text: 'Франция выкупила канал обратно у США' },
      { id: 'D', text: 'Канал превратился в пресноводное озеро и стал непригоден' },
    ],
    correctAnswer: 'A',
    explanation:
      'Первый официальный проход состоялся в день начала мировой войны; пышные церемонии отменили. Канал сократил морской путь между океанами на тысячи километров.',
    sources: [
      'https://www.pancanal.com/en/general-information/history/',
      'https://www.history.com/topics/landmarks/panama-canal',
    ],
    createdAt: '2026-08-09T00:00:00.000Z',
  },
];
