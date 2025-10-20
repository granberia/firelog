#!/usr/bin/env node

import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import simpleGit from 'simple-git';
import CryptoJS from 'crypto-js';
import { marked } from 'marked';

const DRAFTS_DIR = '_drafts';
const POSTS_DIR = '_posts';
const TABS_DIR = '_tabs';
const CDN_IMG_DIR = path.join('cdn', 'img');
const URL_IMG_PREFIX = '/img';
const CONFIG_PATH = 'config.json';
const PASSWORD_PATH = 'password.json';
const git = simpleGit();

async function gitConfig() {
  await git.addConfig('user.name', 'granberia');
  await git.addConfig('user.email', 'reptilesax@gmail.com');
}

function slugify(title) {
  return title
    .trim()
    .replace(/\s+/g, '-') // 공백 → -
    .replace(/-+/g, '-'); // 중복 - 제거
}

function getFormattedDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFullDateTime() {
  const date = new Date();
  const offset = -date.getTimezoneOffset();
  const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(
    2,
    '0'
  );
  const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, '0');
  const sign = offset >= 0 ? '+' : '-';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${sign}${offsetHours}${offsetMinutes}`;
}

async function createDraft() {
  let config, passwords;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    passwords = JSON.parse(fs.readFileSync(PASSWORD_PATH, 'utf-8'));
    if (!passwords.keys || Object.keys(passwords.keys).length === 0) {
      throw new Error('password.json에 유효한 키가 없습니다.');
    }
  } catch (error) {
    console.error(
      `❌ 설정 파일 또는 비밀번호 파일을 읽을 수 없습니다: ${error.message}`
    );
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'title',
      message: '📝 포스트 제목을 입력하세요:',
      validate: (input) => (input ? true : '제목은 비워둘 수 없습니다.')
    },
    {
      type: 'checkbox',
      name: 'categories',
      message: '📂 카테고리를 선택하세요 (스페이스바로 선택, 엔터로 확정):',
      choices: config.categories,
      validate: (input) =>
        input.length > 0 ? true : '하나 이상의 카테고리를 선택해야 합니다.'
    },
    {
      type: 'checkbox',
      name: 'tags',
      message: '🏷️ 태그를 선택하세요 (스페이스바로 선택, 엔터로 확정):',
      choices: config.tags
    },
    {
      type: 'list',
      name: 'isEncrypted',
      message: '🔒 이 포스트를 암호화하시겠습니까?',
      choices: [
        { name: '예', value: true },
        { name: '아니오', value: false }
      ],
      default: 1
    },
    {
      type: 'list',
      name: 'keyId',
      message: '🔑 사용할 암호화 키를 선택하세요:',
      choices: Object.keys(passwords.keys),
      when: (answers) => answers.isEncrypted
    }
  ]);

  const { title, categories, tags, isEncrypted, keyId } = answers;

  const date = getFormattedDate();
  const slug = slugify(title);
  const draftDirName = `${date}-${slug}`;
  const draftDirPath = path.join(DRAFTS_DIR, draftDirName);
  const fileName = `${draftDirName}.md`;
  const filePath = path.join(draftDirPath, fileName);

  let frontMatter = `---
title: ${title}
date: ${getFullDateTime()}
categories: [${categories.join(', ')}]
tags: [${tags.join(', ')}]
`;

  if (isEncrypted) {
    frontMatter += `encrypt: true\nkey_id: ${keyId}\n`;
  }
  const fileContent = `${frontMatter}---\n\n`;

  fs.mkdirSync(draftDirPath, { recursive: true });
  console.log(`📁 초안 폴더를 생성했습니다: ${draftDirPath}`);

  fs.writeFileSync(filePath, fileContent);
  console.log(`✅ 초안 파일이 성공적으로 생성되었습니다: ${filePath}`);
}

async function publishDraft() {
  if (!fs.existsSync(DRAFTS_DIR)) {
    console.log(
      '🤷 초안 폴더가 없습니다. 먼저 draft 명령어로 글을 생성하세요.'
    );
    return;
  }

  // 폴더를 기준으로 초안 목록을 가져옵니다.
  const draftDirs = fs
    .readdirSync(DRAFTS_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  if (draftDirs.length === 0) {
    console.log('🤷 발행할 초안이 없습니다.');
    return;
  }

  const { dirToPublish } = await inquirer.prompt([
    {
      type: 'list',
      name: 'dirToPublish',
      message: '🚀 발행할 초안 폴더를 선택하세요:',
      choices: draftDirs
    }
  ]);

  const sourceDraftDir = path.join(DRAFTS_DIR, dirToPublish); // 예: _drafts/2023-10-27-slug
  const mdFileName = `${dirToPublish}.md`;
  const sourceMdPath = path.join(sourceDraftDir, mdFileName);

  // 목적지 경로 설정
  const destMdPath = path.join(POSTS_DIR, mdFileName);
  const destCdnDir = path.join(CDN_IMG_DIR, dirToPublish);

  if (!fs.existsSync(sourceMdPath)) {
    console.error(
      `❌ 오류: 마크다운 파일(${sourceMdPath})을 찾을 수 없습니다.`
    );
    return;
  }

  // 포스트 내용 처리
  let originalContent = fs.readFileSync(sourceMdPath, 'utf-8');
  const frontMatterRegex = /^---(.*?)---/s;
  const match = originalContent.match(frontMatterRegex);

  if (!match) {
    console.error(
      '❌ Front Matter를 찾을 수 없습니다. 포스트 형식을 확인해주세요.'
    );
    return;
  }

  let frontMatterString = match[1]; // ---를 제외한 순수 Front Matter 내용
  let body = originalContent.substring(match[0].length); // Front Matter 전체 길이 이후의 모든 내용

  // 1. 헤더 이미지 추가
  const firstImageRegex = /!\[(.*?)\]\(\s*(\.\/)?(.*?)\s*\)/;
  const firstImageMatch = firstImageRegex.exec(body);

  if (firstImageMatch) {
    const altText = firstImageMatch[1].replace(/"/g, '\\"');
    const imageFileName = firstImageMatch[3];
    const headerImagePath = `${URL_IMG_PREFIX}/${dirToPublish}/${imageFileName}`;
    const imageFrontMatter = `image:\n  path: ${headerImagePath}\n  alt: "${altText}"\n`;

    frontMatterString += imageFrontMatter;
    console.log('✅ 헤더 이미지를 Front Matter에 추가했습니다.');
  }

  // 2. 본문 이미지 경로 전체 변환
  const imagePathRegex = /!\[(.*?)\]\(\s*(\.\/|\.\.\/)?(.*?)\s*\)/g;
  const newImagePathPrefix = `${URL_IMG_PREFIX}/${dirToPublish}`;
  body = body.replace(imagePathRegex, `![$1](${newImagePathPrefix}/$3)`); // body의 경로를 변환합니다.
  console.log('✅ 본문 이미지 경로를 최종 URL로 변경했습니다.');

  // 3. 암호화 (모든 내용 변경 후 마지막에 수행)
  const isEncrypted = /encrypt:\s*true/.test(frontMatterString);

  if (isEncrypted) {
    const keyIdMatch = /key_id:\s*(.*)/.exec(frontMatterString);
    if (keyIdMatch) {
      const keyId = keyIdMatch[1].trim();
      try {
        const passwords = JSON.parse(fs.readFileSync(PASSWORD_PATH, 'utf-8'));
        const secretKey = passwords.keys[keyId];
        if (!secretKey) throw new Error(`'${keyId}' 키를 찾을 수 없습니다.`);

        const bodyAsHtml = marked.parse(body.trim());

        body = CryptoJS.AES.encrypt(bodyAsHtml, secretKey).toString();
        console.log('🔒 포스트 본문을 성공적으로 암호화했습니다.');
      } catch (error) {
        console.error(`❌ 암호화 중 오류 발생: ${error.message}`);
        return;
      }
    }
  }

  const finalContent = `---${frontMatterString}---\n${body}`;

  // 4. 파일 시스템 작업
  if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR);
  fs.writeFileSync(destMdPath, finalContent);
  console.log(`✅ 마크다운 파일 발행 완료: ${destMdPath}`);

  const assetFiles = fs
    .readdirSync(sourceDraftDir)
    .filter((file) => file !== mdFileName);
  if (assetFiles.length > 0) {
    if (!fs.existsSync(destCdnDir))
      fs.mkdirSync(destCdnDir, { recursive: true });
    for (const asset of assetFiles) {
      fs.renameSync(
        path.join(sourceDraftDir, asset),
        path.join(destCdnDir, asset)
      );
    }
    console.log(`🖼️  이미지 파일들을 이동했습니다: ${destCdnDir}`);
  }

  fs.rmSync(sourceDraftDir, { recursive: true, force: true });
  console.log(`🗑️  원본 초안 폴더를 삭제했습니다: ${sourceDraftDir}`);

  try {
    console.log('📦 Git에 변경사항을 커밋하고 푸시합니다...');
    await gitConfig();

    await git.add(destMdPath); // 수정된 마크다운 파일 추가
    if (assetFiles.length > 0) {
      await git.add(destCdnDir); // 이미지 폴더 추가
    }

    await git.commit(`chore: ${dirToPublish}`);
    await git.push();

    console.log('🎉 포스트 발행이 성공적으로 완료되었습니다!');
  } catch (error) {
    console.error('❌ Git 작업 중 오류가 발생했습니다:', error.message);
  }
}

async function updateTabs() {
  if (!fs.existsSync(TABS_DIR)) {
    console.log(`🤷 '${TABS_DIR}' 폴더가 존재하지 않습니다.`);
    return;
  }

  try {
    console.log(`📦 '${TABS_DIR}' 폴더의 변경사항을 배포합니다...`);
    await gitConfig();
    console.log(`  -> git add ${TABS_DIR}`);
    await git.add(TABS_DIR);

    console.log('  -> git commit -m "chore: deploy tabs"');
    await git.commit('chore: deploy tabs');

    console.log('  -> git push');
    await git.push();

    console.log(`🎉 '${TABS_DIR}' 폴더 배포가 성공적으로 완료되었습니다!`);
  } catch (error) {
    if (error.message.includes('nothing to commit')) {
      console.log('🤷 커밋할 변경사항이 없습니다.');
    } else {
      console.error('❌ Git 작업 중 오류가 발생했습니다:', error.message);
    }
  }
}

async function main() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '👋 안녕하세요! 무엇을 도와드릴까요?',
      choices: [
        { name: '새로운 초안 작성하기', value: 'draft' },
        { name: '초안을 포스트로 발행하기', value: 'publish' },
        { name: '전체 탭을 배포하기', value: 'update' },
        { name: '종료', value: 'exit' }
      ]
    }
  ]);

  switch (action) {
    case 'draft':
      await createDraft();
      break;
    case 'publish':
      await publishDraft();
      break;
    case 'update':
      await updateTabs();
      break;
    case 'exit':
      console.log('👋 다음에 또 만나요!');
      break;
  }
}

main();
