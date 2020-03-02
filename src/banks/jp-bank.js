import { access, debug } from '../utils/logger';
import amountToNumber from '../utils/amount';
import { e2y } from '../utils/era2year';

const checkError = async page => {
  const errorBox = await page.$('.boxErrorBa');
  if (errorBox) {
    const error = await page.evaluate(
      el => el.innerText,
      await errorBox.$('.listBa li')
    );
    access.error(page.url(), error);
    throw new Error(error);
  }
};

const goToTop = async page => {
  if (!(await page.$('a[data-modal="MENU_DIRECTTOP"]'))) {
    throw new Error('Please try again from login.');
  }

  page.click('a[data-modal="MENU_DIRECTTOP"]');
  await page.waitFor(500);

  await Promise.all([
    page.click('div[data-modal="MENU_DIRECTTOP"] .btnTy05.yes a.execute'),
    page.waitFor(500),
    page.waitForSelector('.txtBalanceTy01.alignR span')
  ]);

  await checkError(page);
};

const login = async ({
  state: { page },
  values: {
    username,
    password,
    options: { secretQuestions }
  }
}) => {
  const user = username.split('-');
  if (user.length !== 3 || !password || !secretQuestions) {
    throw new Error('The value is missing.');
  }

  await page.goto('https://direct.jp-bank.japanpost.jp/tp1web/U010101WAK.do');

  await page.waitFor(500);
  await page.type('input[name="okyakusamaBangou1"]', user[0]);
  await page.waitFor(500);
  await page.type('input[name="okyakusamaBangou2"]', user[1]);
  await page.waitFor(500);
  await page.type('input[name="okyakusamaBangou3"]', user[2]);
  await page.waitFor(500);

  await Promise.all([
    page.click('input[value="次へ"]'),
    page.waitForNavigation()
  ]);

  const checkInput = async () => {
    await checkError(page);

    const passwordInput = await page.$('input[name="loginPassword"]');
    const secretWordInput = await page.$('input[name="aikotoba"]');
    const topPage = await page.$('.btnBa.alignR.submit a');

    if (passwordInput) {
      await page.type('input[name="loginPassword"]', password);
      await page.waitFor(500);

      await Promise.all([
        page.click('input[value="ログイン"]'),
        page.waitForNavigation()
      ]);

      return checkInput();
    } else if (secretWordInput) {
      const secretQuestion = await page.evaluate(
        el => el.innerText,
        (await page.$$('.req .listTy02 dd'))[0]
      );
      if (!secretQuestion) {
        throw new Error('The secret question could not be found.');
      }

      const questionSet = secretQuestions.find(
        v => secretQuestion.indexOf(v[0]) !== -1
      );
      if (!questionSet) {
        throw new Error('This question does not exist.');
      }

      await page.type('input[name="aikotoba"]', questionSet[1]);
      await page.waitFor(500);

      await Promise.all([
        page.click('.listBtnTy01 .btnBa:not(.back) a[href="#"]'),
        page.waitForNavigation()
      ]);

      return checkInput();
    } else if (topPage) {
      await Promise.all([
        page.click('.btnBa.alignR.submit a'),
        page.waitForNavigation()
      ]);

      return checkInput();
    } else {
      debug.info('logged in');
    }
  };

  await checkInput();
};

const getBalance = async ({ state: { page } }) => {
  await goToTop(page);

  const balanceText = await page.evaluate(
    el => el.innerText,
    await page.$('.txtBalanceTy01.alignR span')
  );
  if (!balanceText) {
    throw new Error('There was no balance display.');
  }

  return amountToNumber(balanceText);
};

const getLogs = async ({ state: { page } }) => {
  if (!(await page.$('.navGlobal .icon02 a'))) {
    throw new Error('Please try again from login.');
  }

  await Promise.all([
    page.click('.navGlobal .icon02 a'),
    page.waitFor(500),
    page.waitForSelector('table.tblTy91 tbody')
  ]);

  const result = await page.evaluate(
    e =>
      Array.from(e.querySelectorAll('tr')).map(v =>
        Array.from(v.children).map(v => v.innerText)
      ),
    await page.$('table.tblTy91 tbody')
  );
  result.reverse();

  return result.map(v => {
    const [date, deposit, withdrawal, name, balance] = v;
    const dateArr = date.split('-');
    dateArr[0] = e2y(parseInt(dateArr[0]), 'reiwa'); // note: 改元したら変える

    return {
      date: new Date(dateArr.join('-')),
      name: name.trim(),
      type: deposit ? 'deposit' : 'withdrawal',
      amount: amountToNumber(deposit || withdrawal),
      balance: amountToNumber(balance)
    };
  });
};

export const action = args => {
  const { type } = args;

  switch (type) {
    case 'LOGIN':
      return login(args);
    case 'GET_BALANCE':
      return getBalance(args);
    case 'GET_LOGS':
      return getLogs(args);
    default:
      throw new Error('This action does not exist.');
  }
};
